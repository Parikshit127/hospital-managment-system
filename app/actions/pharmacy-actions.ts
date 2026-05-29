'use server';

import { requireTenantContext } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/app/lib/audit';
import { checkDrugInteractions } from '@/app/lib/drug-safety';
import { getPatientBalances } from '@/app/actions/balance-actions';
import { postChargeToIpdBill } from '@/app/actions/ipd-finance-actions';
import { postInvoiceToGL } from '@/app/actions/gl-actions';
import { syncInvoiceToGSTRegister } from '@/app/actions/gst-compliance-actions';

// Helper: post a GL journal entry using account codes (resolves to account IDs)
async function postPharmacyJournal(db: any, organizationId: string, data: {
    narration: string;
    reference_number?: string;
    lines: Array<{ account_code: string; debit: number; credit: number; description?: string }>;
}) {
    const { createJournalEntry } = await import('@/app/actions/gl-actions');
    const resolvedLines = [];
    for (const line of data.lines) {
        const account = await db.gL_Account.findFirst({
            where: { organizationId, account_code: line.account_code },
            select: { id: true }
        });
        if (!account) {
            console.warn(`GL account ${line.account_code} not found for org ${organizationId}, skipping line`);
            continue;
        }
        resolvedLines.push({
            account_id: account.id,
            debit_amount: line.debit,
            credit_amount: line.credit,
            description: line.description,
        });
    }
    if (resolvedLines.length < 2) return; // need at least debit + credit
    return createJournalEntry({
        organizationId,
        entry_date: new Date(),
        entry_type: 'Pharmacy',
        narration: data.narration,
        reference_number: data.reference_number,
        lines: resolvedLines,
    });
}

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

        // 0. OTC Controls — block controlled drugs for walk-in sales
        if (patientId === 'WALKIN') {
            for (const item of items) {
                const med = await db.pharmacy_medicine_master.findUnique({ where: { id: item.medicine_id } });
                if (med && (med.is_narcotic || ['H', 'H1', 'X', 'NDPS'].includes(med.drug_schedule || ''))) {
                    return { success: false, error: `Controlled drug "${med.brand_name}" (Schedule ${med.drug_schedule || 'Narcotic'}) requires a valid prescription — OTC sale blocked` };
                }
            }
        }

        // 1. Deduct stock & build line items with GST + FEFO + movement ledger
        let totalCogs = 0;
        for (const item of items) {
            // FEFO: select earliest non-expired batch if batch_no not specified
            const batchWhere: any = { medicine_id: item.medicine_id, current_stock: { gte: item.quantity }, expiry_date: { gt: new Date() }, is_quarantined: false };
            if (item.batch_no) batchWhere.batch_no = item.batch_no;
            const batch = await db.pharmacy_batch_inventory.findFirst({
                where: batchWhere,
                include: { medicine: true },
                orderBy: { expiry_date: 'asc' }, // FEFO
            });

            if (batch && batch.current_stock >= item.quantity) {
                const updatedBatch = await db.pharmacy_batch_inventory.update({
                    where: { id: batch.id },
                    data: { current_stock: { decrement: item.quantity } }
                });

                const unitPrice = Number(batch.medicine.selling_price) || Number(batch.medicine.price_per_unit) || 0;
                const netPrice = unitPrice * item.quantity;
                const taxRate = Number(batch.medicine.gst_percent) || Number(batch.medicine.tax_rate) || 0;
                const taxAmount = netPrice * taxRate / 100;
                const batchCost = Number(batch.actual_cost || batch.cost_price || 0);
                totalCogs += batchCost * item.quantity;

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
                    batch_no: batch.batch_no,
                    batch_id: batch.id,
                    batch_cost: batchCost,
                });

                // Record inventory movement
                await db.pharmacyInventoryMovement.create({
                    data: {
                        organizationId,
                        medicine_id: batch.medicine.id,
                        batch_id: batch.id,
                        movement_type: 'DISPENSE',
                        quantity_out: item.quantity,
                        unit_cost: batchCost,
                        balance_after: updatedBatch.current_stock,
                        source_type: 'INVOICE',
                        source_id: `COUNTER-${patientId}`,
                    }
                });

                // Auto narcotic register
                if (batch.medicine.is_narcotic || ['H', 'H1', 'X', 'NDPS'].includes(batch.medicine.drug_schedule || '')) {
                    const lastEntry = await db.narcoticRegister.findFirst({
                        where: { organizationId, drug_name: batch.medicine.brand_name },
                        orderBy: { created_at: 'desc' }
                    });
                    await db.narcoticRegister.create({
                        data: {
                            organizationId,
                            drug_name: batch.medicine.brand_name,
                            medicine_id: batch.medicine.id,
                            batch_no: batch.batch_no,
                            batch_id: batch.id,
                            patient_id: patientId !== 'WALKIN' ? patientId : null,
                            quantity_in: 0,
                            quantity_out: item.quantity,
                            balance: (lastEntry?.balance || 0) - item.quantity,
                            transaction_type: 'OUT',
                            source_type: 'DISPENSE',
                            notes: `Counter sale dispense`,
                        }
                    });
                }
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

        // 2.5 IPD AUTO-LINK: if this patient is currently admitted, post the
        // dispensed medicines as line items on their active IPD bill instead of
        // creating a standalone Pharmacy invoice. Stock has already been deducted
        // in step 1, so this only redirects the financial posting.
        if (patientId !== 'WALKIN') {
            const activeAdmission = await db.admissions.findFirst({
                where: { patient_id: patientId, status: 'Admitted', organizationId },
                select: { admission_id: true },
            });
            if (activeAdmission) {
                for (const item of invoiceItems) {
                    await postChargeToIpdBill({
                        admission_id: activeAdmission.admission_id,
                        source_module: 'pharmacy',
                        source_ref_id: `PHARM-COUNTER-${item.medicine_id}-${item.batch_no}-${Date.now()}`,
                        description: `Pharmacy: ${item.medicine_name} (Batch ${item.batch_no}) × ${item.qty}`,
                        quantity: item.qty,
                        unit_price: item.unit_price,
                        tax_rate: item.tax_rate,
                        hsn_sac_code: item.hsn_sac_code,
                        service_category: 'Pharmacy',
                    });
                }

                await logAudit({
                    action: 'PHARMACY_POSTED_TO_IPD',
                    module: 'Pharmacy',
                    entity_type: 'admission',
                    entity_id: activeAdmission.admission_id,
                    details: JSON.stringify({
                        patientId,
                        admission_id: activeAdmission.admission_id,
                        itemCount: invoiceItems.length,
                        total: totalAmount + totalTax,
                    }),
                });

                revalidatePath('/pharmacy/billing');
                return {
                    success: true,
                    total: totalAmount + totalTax,
                    subtotal: totalAmount,
                    tax: totalTax,
                    cgst: totalTax / 2,
                    sgst: totalTax / 2,
                    ipd_admission_id: activeAdmission.admission_id,
                    ipd_posted: true,
                    items: invoiceItems,
                    message: `Posted to IPD bill of admission ${activeAdmission.admission_id} — no separate pharmacy invoice created.`,
                };
            }
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

                const updatedBatch = await tx.pharmacy_batch_inventory.update({
                    where: { id: batch.id },
                    data: { current_stock: { decrement: item.quantity } }
                });

                const unitPrice = Number(batch.medicine.selling_price) || Number(batch.medicine.price_per_unit) || 0;
                const netPrice = unitPrice * item.quantity;
                const taxRate = Number(batch.medicine.gst_percent) || Number(batch.medicine.tax_rate) || 0;
                const taxAmount = netPrice * taxRate / 100;
                const batchCost = Number(batch.actual_cost || batch.cost_price || 0);

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
                    batch_id: batch.id,
                    batch_cost: batchCost,
                });

                // Record inventory movement
                await tx.pharmacyInventoryMovement.create({
                    data: {
                        organizationId,
                        medicine_id: batch.medicine.id,
                        batch_id: batch.id,
                        movement_type: 'DISPENSE',
                        quantity_out: item.quantity,
                        unit_cost: batchCost,
                        balance_after: updatedBatch.current_stock,
                        source_type: 'ORDER',
                        source_id: String(orderId),
                    }
                });

                // Dispense allocation for multi-batch traceability
                if (item.order_item_id) {
                    await tx.dispenseAllocation.create({
                        data: {
                            organizationId,
                            order_item_id: item.order_item_id,
                            batch_id: batch.id,
                            quantity: item.quantity,
                            unit_cost: batchCost,
                        }
                    });
                }

                // Auto narcotic register for controlled drugs
                if (batch.medicine.is_narcotic || ['H', 'H1', 'X', 'NDPS'].includes(batch.medicine.drug_schedule || '')) {
                    const lastEntry = await tx.narcoticRegister.findFirst({
                        where: { organizationId, drug_name: batch.medicine.brand_name },
                        orderBy: { created_at: 'desc' }
                    });
                    await tx.narcoticRegister.create({
                        data: {
                            organizationId,
                            drug_name: batch.medicine.brand_name,
                            medicine_id: batch.medicine.id,
                            batch_no: item.batch_no,
                            batch_id: batch.id,
                            quantity_in: 0,
                            quantity_out: item.quantity,
                            balance: (lastEntry?.balance || 0) - item.quantity,
                            transaction_type: 'OUT',
                            source_type: 'DISPENSE',
                            source_id: String(orderId),
                        }
                    });
                }

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
                    { brand_name: { contains: query, mode: 'insensitive' } },
                    { generic_name: { contains: query, mode: 'insensitive' } }
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

// ── Pharmacy Vendors (unified with finance Vendor master) ──

export async function getSuppliers() {
    try {
        const { db } = await requireTenantContext();
        // Fetch from unified Vendor table, filtered to pharmacy suppliers
        const vendors = await db.vendor.findMany({
            where: { is_pharmacy_supplier: true },
            orderBy: { vendor_name: 'asc' },
        });
        // Map to legacy shape for backward compat with UI
        const data = vendors.map((v: any) => ({
            id: v.id,
            name: v.vendor_name,
            vendor_code: v.vendor_code,
            contact_person: v.contact_person,
            phone: v.phone,
            email: v.email,
            gst_no: v.gst_number,
            drug_license_number: v.drug_license_number,
            drug_license_expiry: v.drug_license_expiry,
            pharmacy_payment_terms: v.pharmacy_payment_terms,
            is_active: v.is_active,
        }));
        return { success: true, data };
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
    drug_license_number?: string;
    drug_license_expiry?: string;
    pharmacy_payment_terms?: number;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();
        // Generate vendor_code from name
        const codeBase = data.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
        const vendor_code = `PH-${codeBase}-${Date.now().toString().slice(-4)}`;

        const vendor = await db.vendor.create({
            data: {
                vendor_name: data.name,
                vendor_code,
                contact_person: data.contact_person || null,
                phone: data.phone || null,
                email: data.email || null,
                gst_number: data.gst_no || null,
                is_pharmacy_supplier: true,
                drug_license_number: data.drug_license_number || null,
                drug_license_expiry: data.drug_license_expiry ? new Date(data.drug_license_expiry) : null,
                pharmacy_payment_terms: data.pharmacy_payment_terms || 30,
                is_active: true,
                organizationId,
            }
        });
        revalidatePath('/pharmacy/suppliers');
        return { success: true, data: vendor };
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
    drug_license_number?: string;
    drug_license_expiry?: string;
    pharmacy_payment_terms?: number;
    is_active?: boolean;
}) {
    try {
        const { db } = await requireTenantContext();
        const updateData: any = {};
        if (data.name !== undefined) updateData.vendor_name = data.name;
        if (data.contact_person !== undefined) updateData.contact_person = data.contact_person;
        if (data.phone !== undefined) updateData.phone = data.phone;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.gst_no !== undefined) updateData.gst_number = data.gst_no;
        if (data.drug_license_number !== undefined) updateData.drug_license_number = data.drug_license_number;
        if (data.drug_license_expiry !== undefined) updateData.drug_license_expiry = data.drug_license_expiry ? new Date(data.drug_license_expiry) : null;
        if (data.pharmacy_payment_terms !== undefined) updateData.pharmacy_payment_terms = data.pharmacy_payment_terms;
        if (data.is_active !== undefined) updateData.is_active = data.is_active;

        const vendor = await db.vendor.update({
            where: { id },
            data: updateData,
        });
        revalidatePath('/pharmacy/suppliers');
        return { success: true, data: vendor };
    } catch (error) {
        return { success: false, error: 'Failed to update supplier' };
    }
}

export async function createPurchaseOrder(
    supplier_id: number,
    items: { medicine_id: number, quantity: number, unit_price: number, gst_rate?: number, hsn_code?: string }[],
    options?: { vendor_id?: number; notes?: string; submit?: boolean }
) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        const gstAmount = items.reduce((sum, item) => {
            const rate = item.gst_rate || 0;
            return sum + (item.quantity * item.unit_price * rate / 100);
        }, 0);
        const poNumber = `PO-${Date.now().toString().slice(-6)}`;

        // Check auto-approve threshold from module config
        let status = 'Draft';
        if (options?.submit) {
            const config = await db.moduleConfig.findFirst({
                where: { organizationId, module_key: 'pharmacy' }
            });
            const settings = config?.settings as any || {};
            const autoApproveBelow = settings.po_auto_approve_below ?? 5000;
            const requireApprovalAbove = settings.po_require_approval_above ?? 50000;

            if (totalAmount < autoApproveBelow) {
                status = 'Approved';
            } else if (totalAmount >= requireApprovalAbove) {
                status = 'Submitted'; // needs manual approval
            } else {
                status = 'Submitted';
            }
        }

        const po = await db.purchaseOrder.create({
            data: {
                po_number: poNumber,
                supplier_id,
                vendor_id: options?.vendor_id || null,
                status,
                total_amount: totalAmount,
                gst_amount: gstAmount,
                approved_at: status === 'Approved' ? new Date() : null,
                approved_by: status === 'Approved' ? 'AUTO' : null,
                notes: options?.notes || null,
                organizationId,
                items: {
                    create: items.map(item => ({
                        medicine_id: item.medicine_id,
                        quantity_ordered: item.quantity,
                        unit_price: item.unit_price,
                        gst_rate: item.gst_rate || 0,
                        hsn_code: item.hsn_code || null,
                        quantity_received: 0
                    }))
                }
            }
        });

        revalidatePath('/pharmacy/purchase-orders');
        return { success: true, data: po };
    } catch (error: any) {
        return { success: false, error: 'Failed to create PO' };
    }
}

export async function submitPurchaseOrder(poId: number) {
    try {
        const { db } = await requireTenantContext();
        const po = await db.purchaseOrder.findUnique({ where: { id: poId } });
        if (!po || po.status !== 'Draft') return { success: false, error: 'PO must be in Draft status' };

        const config = await db.moduleConfig.findFirst({
            where: { organizationId: po.organizationId, module_key: 'pharmacy' }
        });
        const settings = config?.settings as any || {};
        const autoApproveBelow = settings.po_auto_approve_below ?? 5000;

        const newStatus = po.total_amount < autoApproveBelow ? 'Approved' : 'Submitted';

        await db.purchaseOrder.update({
            where: { id: poId },
            data: {
                status: newStatus,
                ordered_at: new Date(),
                approved_at: newStatus === 'Approved' ? new Date() : null,
                approved_by: newStatus === 'Approved' ? 'AUTO' : null,
            }
        });

        revalidatePath('/pharmacy/purchase-orders');
        return { success: true, status: newStatus };
    } catch (error) {
        return { success: false, error: 'Failed to submit PO' };
    }
}

export async function approvePurchaseOrder(poId: number, userId: string, approve: boolean, reason?: string) {
    try {
        const { db } = await requireTenantContext();
        const po = await db.purchaseOrder.findUnique({ where: { id: poId } });
        if (!po || po.status !== 'Submitted') return { success: false, error: 'PO must be in Submitted status' };

        await db.purchaseOrder.update({
            where: { id: poId },
            data: {
                status: approve ? 'Approved' : 'Rejected',
                approved_at: new Date(),
                approved_by: userId,
                notes: !approve && reason ? `Rejected: ${reason}` : po.notes,
            }
        });

        revalidatePath('/pharmacy/purchase-orders');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to process PO approval' };
    }
}

export async function receivePurchaseOrder(
    poId: number,
    receivedItems: {
        itemId: number;
        qtyReceived: number;
        batch_no: string;
        expiry: string;
        actual_cost?: number;
        mrp?: number;
        manufacture_date?: string;
        rejected_qty?: number;
        rejection_reason?: string;
        rack_location?: string;
    }[]
) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const po = await db.purchaseOrder.findUnique({
            where: { id: poId },
            include: { items: true }
        });
        if (!po) return { success: false, error: 'PO not found' };
        if (!['Approved', 'Partially Received'].includes(po.status)) {
            return { success: false, error: 'PO must be Approved or Partially Received to receive items' };
        }

        const grnNumber = `GRN-${Date.now().toString().slice(-8)}`;

        await db.$transaction(async (tx: any) => {
            // Create GRN record
            const grn = await tx.goodsReceiptNote.create({
                data: {
                    grn_number: grnNumber,
                    po_id: poId,
                    supplier_id: po.supplier_id,
                    vendor_id: po.vendor_id || null,
                    total_amount: receivedItems.reduce((s, i) => s + (i.qtyReceived * (i.actual_cost || 0)), 0),
                    rejected_quantity: receivedItems.reduce((s, i) => s + (i.rejected_qty || 0), 0),
                    rejection_reason: receivedItems.filter(i => i.rejection_reason).map(i => i.rejection_reason).join('; ') || null,
                    organizationId,
                }
            });

            for (const item of receivedItems) {
                // Validate: don't exceed ordered qty
                const poItem = po.items.find((pi: any) => pi.id === item.itemId);
                if (!poItem) continue;
                const maxReceivable = poItem.quantity_ordered - poItem.quantity_received;
                if (item.qtyReceived > maxReceivable) {
                    throw new Error(`Over-receipt: item ${poItem.id} can receive max ${maxReceivable}, got ${item.qtyReceived}`);
                }

                // Validate: reject expired batches
                const expiryDate = new Date(item.expiry);
                if (expiryDate <= new Date()) {
                    throw new Error(`Batch ${item.batch_no} is already expired (${item.expiry})`);
                }

                // Update PO item received qty
                await tx.purchaseOrderItem.update({
                    where: { id: item.itemId },
                    data: { quantity_received: { increment: item.qtyReceived } },
                });

                // Upsert batch inventory (increment if same medicine+batch exists)
                const existingBatch = await tx.pharmacy_batch_inventory.findUnique({
                    where: { medicine_id_batch_no: { medicine_id: poItem.medicine_id, batch_no: item.batch_no } }
                });

                let batchRecord;
                if (existingBatch) {
                    batchRecord = await tx.pharmacy_batch_inventory.update({
                        where: { id: existingBatch.id },
                        data: {
                            current_stock: { increment: item.qtyReceived },
                            actual_cost: item.actual_cost ?? existingBatch.actual_cost,
                            cost_price: item.actual_cost ?? existingBatch.cost_price,
                            mrp: item.mrp ?? existingBatch.mrp,
                            vendor_id: po.vendor_id || null,
                            grn_id: grn.id,
                        }
                    });
                } else {
                    batchRecord = await tx.pharmacy_batch_inventory.create({
                        data: {
                            medicine_id: poItem.medicine_id,
                            batch_no: item.batch_no,
                            current_stock: item.qtyReceived,
                            expiry_date: expiryDate,
                            manufacture_date: item.manufacture_date ? new Date(item.manufacture_date) : null,
                            cost_price: item.actual_cost || poItem.unit_price,
                            actual_cost: item.actual_cost || poItem.unit_price,
                            mrp: item.mrp || null,
                            rack_location: item.rack_location || 'PO-RECEIVE',
                            supplier_name: null,
                            vendor_id: po.vendor_id || null,
                            grn_id: grn.id,
                        }
                    });
                }

                // Record inventory movement
                await tx.pharmacyInventoryMovement.create({
                    data: {
                        organizationId,
                        medicine_id: poItem.medicine_id,
                        batch_id: batchRecord.id,
                        movement_type: 'GRN_RECEIPT',
                        quantity_in: item.qtyReceived,
                        unit_cost: item.actual_cost || poItem.unit_price,
                        balance_after: batchRecord.current_stock,
                        source_type: 'GRN',
                        source_id: String(grn.id),
                    }
                });

                // Auto narcotic register for controlled drugs
                const medicine = await tx.pharmacy_medicine_master.findUnique({ where: { id: poItem.medicine_id } });
                if (medicine && (medicine.is_narcotic || ['H', 'H1', 'X', 'NDPS'].includes(medicine.drug_schedule || ''))) {
                    const lastEntry = await tx.narcoticRegister.findFirst({
                        where: { organizationId, drug_name: medicine.brand_name },
                        orderBy: { created_at: 'desc' }
                    });
                    await tx.narcoticRegister.create({
                        data: {
                            organizationId,
                            drug_name: medicine.brand_name,
                            medicine_id: medicine.id,
                            batch_no: item.batch_no,
                            batch_id: batchRecord.id,
                            quantity_in: item.qtyReceived,
                            quantity_out: 0,
                            balance: (lastEntry?.balance || 0) + item.qtyReceived,
                            transaction_type: 'IN',
                            source_type: 'GRN',
                            source_id: String(grn.id),
                            notes: `GRN ${grnNumber} receipt`,
                        }
                    });
                }
            }

            // Determine PO status: fully received or partially
            const updatedItems = await tx.purchaseOrderItem.findMany({ where: { po_id: poId } });
            const allReceived = updatedItems.every((i: any) => i.quantity_received >= i.quantity_ordered);
            const someReceived = updatedItems.some((i: any) => i.quantity_received > 0);

            await tx.purchaseOrder.update({
                where: { id: poId },
                data: {
                    status: allReceived ? 'Received' : (someReceived ? 'Partially Received' : po.status),
                    received_at: allReceived ? new Date() : null,
                }
            });
        });

        revalidatePath('/pharmacy/purchase-orders');
        revalidatePath('/pharmacy/inventory');
        return { success: true, grn_number: grnNumber };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to receive PO' };
    }
}

export async function getPurchaseOrders() {
    try {
        const { db } = await requireTenantContext();
        const pos = await db.purchaseOrder.findMany({
            orderBy: { created_at: 'desc' },
            include: {
                supplier: true,
                vendor: { select: { id: true, vendor_name: true, vendor_code: true, gst_number: true } },
                items: { include: { medicine: true } },
                grns: { select: { id: true, grn_number: true, received_at: true } },
            }
        });
        return { success: true, data: pos };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function processReturn(data: {
    return_type: string,  // patient_return, supplier_return, expired_stock, damage_writeoff
    medicine_id: number,
    batch_id?: string,
    quantity: number,
    reason: string,
    invoice_id?: number,    // original sale invoice for patient returns
    vendor_id?: number,     // for supplier returns
    po_id?: number,         // for supplier returns
    purchase_invoice_id?: number, // for supplier returns
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        let creditNoteId: number | null = null;
        let refundAmount = 0;

        await db.$transaction(async (tx: any) => {
            const medicine = await tx.pharmacy_medicine_master.findUnique({
                where: { id: data.medicine_id }
            });
            const unitPrice = Number(medicine?.selling_price) || Number(medicine?.price_per_unit) || 0;
            const taxRate = Number(medicine?.gst_percent) || Number(medicine?.tax_rate) || 0;

            // Find the batch record
            let batchRecord: any = null;
            if (data.batch_id) {
                batchRecord = await tx.pharmacy_batch_inventory.findFirst({
                    where: { batch_no: data.batch_id, medicine_id: data.medicine_id }
                });
            }
            const batchCost = Number(batchRecord?.actual_cost || batchRecord?.cost_price || unitPrice);

            // Determine movement type and stock action
            let movementType: string;
            let returnTypeNormalized = data.return_type;

            if (data.return_type === 'Patient' || data.return_type === 'patient_return') {
                movementType = 'PATIENT_RETURN';
                returnTypeNormalized = 'patient_return';
                refundAmount = (unitPrice * data.quantity) + (unitPrice * data.quantity * taxRate / 100);

                // Restock sealed items
                if (batchRecord) {
                    const updated = await tx.pharmacy_batch_inventory.update({
                        where: { id: batchRecord.id },
                        data: { current_stock: { increment: data.quantity } }
                    });
                    await tx.pharmacyInventoryMovement.create({
                        data: {
                            organizationId, medicine_id: data.medicine_id, batch_id: batchRecord.id,
                            movement_type: 'PATIENT_RETURN', quantity_in: data.quantity, unit_cost: batchCost,
                            balance_after: updated.current_stock, source_type: 'RETURN', reason: data.reason,
                        }
                    });
                }
            } else if (data.return_type === 'supplier_return') {
                movementType = 'SUPPLIER_RETURN';
                refundAmount = batchCost * data.quantity;

                // Deduct stock
                if (batchRecord) {
                    if (batchRecord.current_stock < data.quantity) {
                        throw new Error(`Insufficient stock for supplier return: have ${batchRecord.current_stock}, need ${data.quantity}`);
                    }
                    const updated = await tx.pharmacy_batch_inventory.update({
                        where: { id: batchRecord.id },
                        data: { current_stock: { decrement: data.quantity } }
                    });
                    await tx.pharmacyInventoryMovement.create({
                        data: {
                            organizationId, medicine_id: data.medicine_id, batch_id: batchRecord.id,
                            movement_type: 'SUPPLIER_RETURN', quantity_out: data.quantity, unit_cost: batchCost,
                            balance_after: updated.current_stock, source_type: 'RETURN', reason: data.reason,
                        }
                    });
                }
            } else {
                // Expired / damage_writeoff
                movementType = 'EXPIRY_WRITEOFF';
                returnTypeNormalized = data.return_type === 'Expired' ? 'expired_stock' : 'damage_writeoff';
                refundAmount = batchCost * data.quantity;

                if (batchRecord) {
                    if (batchRecord.current_stock < data.quantity) {
                        throw new Error(`Insufficient stock for write-off: have ${batchRecord.current_stock}, need ${data.quantity}`);
                    }
                    const updated = await tx.pharmacy_batch_inventory.update({
                        where: { id: batchRecord.id },
                        data: { current_stock: { decrement: data.quantity } }
                    });
                    await tx.pharmacyInventoryMovement.create({
                        data: {
                            organizationId, medicine_id: data.medicine_id, batch_id: batchRecord.id,
                            movement_type: 'EXPIRY_WRITEOFF', quantity_out: data.quantity, unit_cost: batchCost,
                            balance_after: updated.current_stock, source_type: 'RETURN', reason: data.reason,
                        }
                    });
                }
            }

            await tx.pharmacyReturn.create({
                data: {
                    return_type: returnTypeNormalized,
                    medicine_id: data.medicine_id,
                    batch_id: data.batch_id,
                    batch_record_id: batchRecord?.id || null,
                    quantity: data.quantity,
                    unit_cost: batchCost,
                    reason: data.reason,
                    vendor_id: data.vendor_id || null,
                    po_id: data.po_id || null,
                    invoice_id: data.purchase_invoice_id || null,
                    original_invoice_id: data.invoice_id || null,
                    status: 'Processed',
                    processed_by: session.id,
                    gl_posted: false,
                    organizationId
                }
            });

            // Auto narcotic register for controlled drugs
            if (medicine && (medicine.is_narcotic || ['H', 'H1', 'X', 'NDPS'].includes(medicine.drug_schedule || ''))) {
                const lastEntry = await tx.narcoticRegister.findFirst({
                    where: { organizationId, drug_name: medicine.brand_name },
                    orderBy: { created_at: 'desc' }
                });
                const isStockIn = movementType === 'PATIENT_RETURN';
                await tx.narcoticRegister.create({
                    data: {
                        organizationId,
                        drug_name: medicine.brand_name,
                        medicine_id: medicine.id,
                        batch_no: data.batch_id,
                        batch_id: batchRecord?.id,
                        quantity_in: isStockIn ? data.quantity : 0,
                        quantity_out: isStockIn ? 0 : data.quantity,
                        balance: (lastEntry?.balance || 0) + (isStockIn ? data.quantity : -data.quantity),
                        transaction_type: isStockIn ? 'IN' : 'OUT',
                        source_type: movementType,
                        notes: `${returnTypeNormalized}: ${data.reason}`,
                    }
                });
            }
        });

        // Patient return: create credit note
        if (data.invoice_id && (data.return_type === 'Patient' || data.return_type === 'patient_return') && refundAmount > 0) {
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

            if (cnResult.success) creditNoteId = cnResult.data?.id;

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

        // GL posting for write-offs and supplier returns
        if (['Expired', 'expired_stock', 'damage_writeoff'].includes(data.return_type)) {
            try {
                await postPharmacyJournal(db, organizationId, {
                    narration: `Pharmacy write-off: ${data.reason}`,
                    reference_number: `PHARM-WRITEOFF-${Date.now()}`,
                    lines: [
                        { account_code: '7110', debit: refundAmount, credit: 0, description: 'Pharmacy write-off expense' },
                        { account_code: '1160', debit: 0, credit: refundAmount, description: 'Pharmacy inventory reduction' },
                    ]
                });
            } catch (glErr) {
                console.error('GL posting failed for pharmacy write-off:', glErr);
            }

            await logAudit({
                action: 'PHARMACY_EXPIRY_WRITEOFF',
                module: 'Pharmacy',
                entity_type: 'pharmacy_return',
                details: JSON.stringify({ medicine_id: data.medicine_id, quantity: data.quantity, write_off_value: refundAmount, batch: data.batch_id }),
            });
        }

        if (data.return_type === 'supplier_return' && refundAmount > 0) {
            try {
                await postPharmacyJournal(db, organizationId, {
                    narration: `Supplier return: ${data.reason}`,
                    reference_number: `PHARM-SUPRET-${Date.now()}`,
                    lines: [
                        { account_code: '3110', debit: refundAmount, credit: 0, description: 'Vendor payable reduction' },
                        { account_code: '1160', debit: 0, credit: refundAmount, description: 'Pharmacy inventory reduction' },
                    ]
                });
            } catch (glErr) {
                console.error('GL posting failed for supplier return:', glErr);
            }
        }

        revalidatePath('/pharmacy/returns');
        revalidatePath('/pharmacy/inventory');
        return { success: true, credit_note_id: creditNoteId, refund_amount: refundAmount };
    } catch (error: any) {
        console.error('Return processing error:', error);
        return { success: false, error: error.message || 'Failed to process return' };
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

// ============================================
// PHASE 3 — INVENTORY MOVEMENT LEDGER QUERIES
// ============================================

export async function getInventoryMovements(filters?: {
    medicine_id?: number;
    batch_id?: number;
    movement_type?: string;
    from?: string;
    to?: string;
    limit?: number;
}) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.medicine_id) where.medicine_id = filters.medicine_id;
        if (filters?.batch_id) where.batch_id = filters.batch_id;
        if (filters?.movement_type) where.movement_type = filters.movement_type;
        if (filters?.from || filters?.to) {
            where.created_at = {};
            if (filters.from) where.created_at.gte = new Date(filters.from);
            if (filters.to) where.created_at.lte = new Date(filters.to + 'T23:59:59');
        }

        const movements = await db.pharmacyInventoryMovement.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: filters?.limit || 500,
            include: {
                medicine: { select: { brand_name: true, generic_name: true } },
                batch: { select: { batch_no: true, expiry_date: true } },
            }
        });
        return { success: true, data: movements };
    } catch (error) {
        return { success: false, error: 'Failed to load movements' };
    }
}

// ============================================
// PHASE 5 — PURCHASE INVOICE & 3-WAY MATCHING
// ============================================

export async function createPurchaseInvoice(data: {
    vendor_id: number;
    po_id?: number;
    invoice_number: string;
    invoice_date: string;
    due_date?: string;
    vendor_gstin?: string;
    lines: Array<{
        medicine_id: number;
        grn_id?: number;
        po_item_id?: number;
        quantity: number;
        unit_price: number;
        gst_rate: number;
        hsn_code?: string;
    }>;
}) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const lines = data.lines.map(line => {
            const taxable = line.quantity * line.unit_price;
            const gstAmt = taxable * line.gst_rate / 100;
            const isInter = false; // TODO: derive from vendor state vs org state
            return {
                ...line,
                line_total: taxable + gstAmt,
                cgst_amount: isInter ? 0 : gstAmt / 2,
                sgst_amount: isInter ? 0 : gstAmt / 2,
                igst_amount: isInter ? gstAmt : 0,
            };
        });

        const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
        const totalCgst = lines.reduce((s, l) => s + l.cgst_amount, 0);
        const totalSgst = lines.reduce((s, l) => s + l.sgst_amount, 0);
        const totalIgst = lines.reduce((s, l) => s + l.igst_amount, 0);
        const totalAmount = lines.reduce((s, l) => s + l.line_total, 0);

        const invoice = await db.pharmacyPurchaseInvoice.create({
            data: {
                organizationId,
                invoice_number: data.invoice_number,
                vendor_id: data.vendor_id,
                po_id: data.po_id || null,
                invoice_date: new Date(data.invoice_date),
                due_date: data.due_date ? new Date(data.due_date) : null,
                subtotal,
                cgst_amount: totalCgst,
                sgst_amount: totalSgst,
                igst_amount: totalIgst,
                total_amount: totalAmount,
                vendor_gstin: data.vendor_gstin || null,
                status: 'Draft',
                line_items: {
                    create: lines.map(l => ({
                        medicine_id: l.medicine_id,
                        grn_id: l.grn_id || null,
                        po_item_id: l.po_item_id || null,
                        quantity: l.quantity,
                        unit_price: l.unit_price,
                        gst_rate: l.gst_rate,
                        cgst_amount: l.cgst_amount,
                        sgst_amount: l.sgst_amount,
                        igst_amount: l.igst_amount,
                        line_total: l.line_total,
                        hsn_code: l.hsn_code || null,
                    }))
                }
            }
        });

        revalidatePath('/pharmacy/purchase-invoices');
        return { success: true, data: invoice };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to create purchase invoice' };
    }
}

export async function matchPurchaseInvoice(invoiceId: number) {
    try {
        const { db } = await requireTenantContext();

        const invoice = await db.pharmacyPurchaseInvoice.findUnique({
            where: { id: invoiceId },
            include: { line_items: true, po: { include: { items: true, grns: { include: { batches: true } } } } }
        });
        if (!invoice) return { success: false, error: 'Invoice not found' };

        const config = await db.moduleConfig.findFirst({
            where: { organizationId: invoice.organizationId, module_key: 'pharmacy' }
        });
        const tolerance = (config?.settings as any)?.matching_tolerance_pct ?? 5;

        const variances: any[] = [];
        let allWithinTolerance = true;

        for (const line of invoice.line_items) {
            const poItem = invoice.po?.items.find((pi: any) => pi.id === line.po_item_id);
            const variance: any = {
                medicine_id: line.medicine_id,
                invoice_qty: line.quantity,
                invoice_rate: line.unit_price,
                po_qty: poItem?.quantity_ordered || null,
                po_rate: poItem?.unit_price || null,
                grn_qty: poItem?.quantity_received || null,
            };

            // Quantity variance
            if (poItem && line.quantity !== poItem.quantity_received) {
                variance.qty_variance = line.quantity - poItem.quantity_received;
                const pct = Math.abs(variance.qty_variance) / poItem.quantity_received * 100;
                if (pct > tolerance) allWithinTolerance = false;
                variance.qty_variance_pct = pct;
            }

            // Rate variance
            if (poItem && Math.abs(line.unit_price - poItem.unit_price) > 0.01) {
                variance.rate_variance = line.unit_price - poItem.unit_price;
                const pct = Math.abs(variance.rate_variance) / poItem.unit_price * 100;
                if (pct > tolerance) allWithinTolerance = false;
                variance.rate_variance_pct = pct;
            }

            variances.push(variance);
        }

        return {
            success: true,
            data: {
                invoice_id: invoiceId,
                variances,
                all_within_tolerance: allWithinTolerance,
                tolerance_pct: tolerance,
                can_auto_post: allWithinTolerance,
            }
        };
    } catch (error: any) {
        return { success: false, error: error.message || 'Matching failed' };
    }
}

export async function postPurchaseInvoice(invoiceId: number) {
    try {
        const { db, organizationId } = await requireTenantContext();

        const invoice = await db.pharmacyPurchaseInvoice.findUnique({
            where: { id: invoiceId },
            include: { line_items: true, vendor: true }
        });
        if (!invoice) return { success: false, error: 'Invoice not found' };
        if (!['Draft', 'PendingApproval'].includes(invoice.status)) {
            return { success: false, error: 'Invoice must be Draft or PendingApproval to post' };
        }

        // GL posting: debit Inventory + GST Input, credit Vendor Payable
        try {
            const glLines: Array<{ account_code: string; debit: number; credit: number; description?: string }> = [];

            if (invoice.subtotal > 0) {
                glLines.push({ account_code: '1160', debit: Number(invoice.subtotal), credit: 0, description: `Purchase: ${invoice.invoice_number}` });
            }
            if (Number(invoice.cgst_amount) > 0) {
                glLines.push({ account_code: '1170', debit: Number(invoice.cgst_amount), credit: 0, description: 'CGST Input Credit' });
            }
            if (Number(invoice.sgst_amount) > 0) {
                glLines.push({ account_code: '1171', debit: Number(invoice.sgst_amount), credit: 0, description: 'SGST Input Credit' });
            }
            if (Number(invoice.igst_amount) > 0) {
                glLines.push({ account_code: '1172', debit: Number(invoice.igst_amount), credit: 0, description: 'IGST Input Credit' });
            }
            glLines.push({ account_code: '3110', debit: 0, credit: Number(invoice.total_amount), description: `Payable: ${invoice.vendor?.vendor_name}` });

            await postPharmacyJournal(db, organizationId, {
                narration: `Pharmacy purchase invoice ${invoice.invoice_number} from ${invoice.vendor?.vendor_name}`,
                reference_number: `PI-${invoice.invoice_number}`,
                lines: glLines,
            });
        } catch (glErr) {
            console.error('GL posting failed for purchase invoice:', glErr);
        }

        // GST inward register entry
        try {
            await db.gST_Invoice_Register.create({
                data: {
                    organizationId,
                    transaction_type: 'Inward',
                    invoice_number: invoice.invoice_number,
                    invoice_date: invoice.invoice_date,
                    party_name: invoice.vendor?.vendor_name || '',
                    party_gstin: invoice.vendor_gstin || invoice.vendor?.gst_number || '',
                    taxable_amount: Number(invoice.subtotal),
                    cgst_amount: Number(invoice.cgst_amount),
                    sgst_amount: Number(invoice.sgst_amount),
                    igst_amount: Number(invoice.igst_amount),
                    total_amount: Number(invoice.total_amount),
                    hsn_code: invoice.line_items[0]?.hsn_code || '3004',
                    place_of_supply: '',
                    is_reverse_charge: false,
                    status: 'Filed',
                }
            });
        } catch (gstErr) {
            console.error('GST register failed for purchase invoice:', gstErr);
        }

        await db.pharmacyPurchaseInvoice.update({
            where: { id: invoiceId },
            data: { status: 'Posted', gl_posted: true }
        });

        revalidatePath('/pharmacy/purchase-invoices');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to post purchase invoice' };
    }
}

export async function recordSupplierPayment(data: {
    invoice_id: number;
    amount: number;
    payment_method: string;
    payment_reference?: string;
}) {
    try {
        const { db } = await requireTenantContext();

        const invoice = await db.pharmacyPurchaseInvoice.findUnique({
            where: { id: data.invoice_id },
            include: { vendor: true }
        });
        if (!invoice) return { success: false, error: 'Invoice not found' };
        if (!['Posted', 'PartiallyPaid'].includes(invoice.status)) {
            return { success: false, error: 'Invoice must be Posted or PartiallyPaid' };
        }

        const newPaid = Number(invoice.amount_paid) + data.amount;
        const fullyPaid = newPaid >= Number(invoice.total_amount);

        await db.pharmacyPurchaseInvoice.update({
            where: { id: data.invoice_id },
            data: {
                amount_paid: newPaid,
                status: fullyPaid ? 'Paid' : 'PartiallyPaid',
            }
        });

        // GL: debit Vendor Payable, credit Cash/Bank
        try {
            await postPharmacyJournal(db, invoice.organizationId, {
                narration: `Supplier payment: ${invoice.vendor?.vendor_name} — ${invoice.invoice_number}`,
                reference_number: `SUPPAY-${invoice.invoice_number}-${Date.now()}`,
                lines: [
                    { account_code: '3110', debit: data.amount, credit: 0, description: 'Vendor payable settlement' },
                    { account_code: data.payment_method === 'Bank' ? '1010' : '1000', debit: 0, credit: data.amount, description: `Payment via ${data.payment_method}` },
                ]
            });
        } catch (glErr) {
            console.error('GL posting failed for supplier payment:', glErr);
        }

        revalidatePath('/pharmacy/purchase-invoices');
        return { success: true, fully_paid: fullyPaid };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to record payment' };
    }
}

export async function getPurchaseInvoices(filters?: { status?: string; vendor_id?: number }) {
    try {
        const { db } = await requireTenantContext();
        const where: any = {};
        if (filters?.status) where.status = filters.status;
        if (filters?.vendor_id) where.vendor_id = filters.vendor_id;

        const invoices = await db.pharmacyPurchaseInvoice.findMany({
            where,
            orderBy: { created_at: 'desc' },
            include: {
                vendor: { select: { vendor_name: true, vendor_code: true } },
                po: { select: { po_number: true } },
                line_items: { include: { medicine: { select: { brand_name: true } } } },
            }
        });
        return { success: true, data: invoices };
    } catch (error) {
        return { success: false, error: 'Failed to load purchase invoices' };
    }
}

// ============================================
// PHASE 7 — STOCK ADJUSTMENT (controlled)
// ============================================

export async function adjustStock(data: {
    medicine_id: number;
    batch_id: number;
    adjustment_qty: number; // positive = add, negative = deduct
    reason: string;
}) {
    try {
        const { db, organizationId, session } = await requireTenantContext();

        const batch = await db.pharmacy_batch_inventory.findUnique({ where: { id: data.batch_id } });
        if (!batch) return { success: false, error: 'Batch not found' };

        const newStock = batch.current_stock + data.adjustment_qty;
        if (newStock < 0) return { success: false, error: 'Adjustment would result in negative stock' };

        const updated = await db.pharmacy_batch_inventory.update({
            where: { id: data.batch_id },
            data: { current_stock: newStock }
        });

        await db.pharmacyInventoryMovement.create({
            data: {
                organizationId,
                medicine_id: data.medicine_id,
                batch_id: data.batch_id,
                movement_type: 'ADJUSTMENT',
                quantity_in: data.adjustment_qty > 0 ? data.adjustment_qty : 0,
                quantity_out: data.adjustment_qty < 0 ? Math.abs(data.adjustment_qty) : 0,
                unit_cost: Number(batch.actual_cost || batch.cost_price || 0),
                balance_after: updated.current_stock,
                source_type: 'ADJUSTMENT',
                user_id: session.id,
                reason: data.reason,
            }
        });

        // Narcotic register for controlled drugs
        const medicine = await db.pharmacy_medicine_master.findUnique({ where: { id: data.medicine_id } });
        if (medicine && (medicine.is_narcotic || ['H', 'H1', 'X', 'NDPS'].includes(medicine.drug_schedule || ''))) {
            const lastEntry = await db.narcoticRegister.findFirst({
                where: { organizationId, drug_name: medicine.brand_name },
                orderBy: { created_at: 'desc' }
            });
            await db.narcoticRegister.create({
                data: {
                    organizationId,
                    drug_name: medicine.brand_name,
                    medicine_id: medicine.id,
                    batch_no: batch.batch_no,
                    batch_id: batch.id,
                    quantity_in: data.adjustment_qty > 0 ? data.adjustment_qty : 0,
                    quantity_out: data.adjustment_qty < 0 ? Math.abs(data.adjustment_qty) : 0,
                    balance: (lastEntry?.balance || 0) + data.adjustment_qty,
                    transaction_type: data.adjustment_qty > 0 ? 'IN' : 'OUT',
                    source_type: 'ADJUSTMENT',
                    notes: `Stock adjustment: ${data.reason}`,
                }
            });
        }

        await logAudit({
            action: 'PHARMACY_STOCK_ADJUSTMENT',
            module: 'Pharmacy',
            entity_type: 'pharmacy_batch_inventory',
            entity_id: String(data.batch_id),
            details: JSON.stringify({ adjustment_qty: data.adjustment_qty, reason: data.reason, new_stock: updated.current_stock }),
        });

        revalidatePath('/pharmacy/inventory');
        return { success: true, new_stock: updated.current_stock };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to adjust stock' };
    }
}
