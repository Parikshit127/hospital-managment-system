'use server';

import { requireTenantContext } from '@/backend/tenant';
import {
    denyUnlessPharmacyRole,
    PHARMACY_CATALOG_ROLES,
    PHARMACY_OPERATE_ROLES,
    PHARMACY_PROCUREMENT_ROLES,
    PHARMACY_PO_APPROVE_ROLES,
    PHARMACY_RETURN_ROLES,
} from '@/app/lib/pharmacy-access';
import { getTenantPrisma } from '@/backend/db';
import { buildWalkinNote, parseWalkinNote } from '@/app/lib/walkin-note';
import { revalidatePath, updateTag, unstable_cache } from 'next/cache';

// ── Cache invalidation tags ─────────────────────────────────────────
// pharmacy:catalog  → fired on medicine create/update/deactivate
// pharmacy:stock    → fired on batch add, dispense, invoice generation, GRN
// pharmacy:orders   → fired on pharmacy order changes (queue, completion)
// updateTag (Next 16) is the server-action invalidation primitive — no
// cache-life profile required, read-your-own-writes within the same action.
function invalidatePharmacyTags(tags: ReadonlyArray<'catalog' | 'stock' | 'orders'>) {
    for (const t of tags) updateTag(`pharmacy:${t}`);
}
import { logAudit } from '@/app/lib/audit';
import { checkDrugInteractions } from '@/app/lib/drug-safety';
import { getPatientBalances } from '@/app/actions/balance-actions';
import { postChargeToIpdBill } from '@/app/actions/ipd-finance-actions';
import { notifyUsersByRole } from '@/app/actions/notification-actions';
import { isBillClosedForCharges, BILL_FINALIZED_INTENT_MSG } from '@/app/lib/bill-status';
import { scheduleMedicationAdministrations } from '@/app/actions/ipd-emr-actions';
import { postInvoiceToGL } from '@/app/actions/gl-actions';
import { syncInvoiceToGSTRegister } from '@/app/actions/gst-compliance-actions';
import { generateSequentialNumber, generateReceiptNumber as genRcpNum } from '@/app/lib/sequence-generator';

import { validateBackdate } from '@/app/lib/backdate';
import { dispensingKey } from '@/app/lib/pharmacy-bill-group';

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

// Invoice and receipt number generation now uses sequential generator from @/app/lib/sequence-generator

/**
 * The only batches a patient may legally be given: in stock, not quarantined,
 * and NOT past expiry.
 *
 * Expiry is the clause that kept getting left out. The counter-sale path
 * filtered on it but every IPD indent allocator did not — and because they all
 * sort FEFO (`expiry_date: 'asc'`), an expired batch wasn't merely allowed, it
 * was the FIRST one picked. Anything that selects stock to hand over must build
 * its `where` from this helper so the three conditions can't drift apart again.
 *
 * `new Date()` is evaluated per call on purpose — a module-level constant would
 * freeze "now" at server start and slowly begin admitting expired stock.
 */
function dispensableBatchWhere(medicineId: number) {
    return {
        medicine_id: medicineId,
        current_stock: { gt: 0 },
        is_quarantined: false,
        expiry_date: { gt: new Date() },
    };
}

/** Human-readable reason a specific batch may not be dispensed, or null if it may. */
function batchDispenseBlocker(batch: { expiry_date: Date; is_quarantined: boolean }): string | null {
    if (batch.is_quarantined) return 'is quarantined';
    if (new Date(batch.expiry_date) <= new Date()) {
        return `expired on ${new Date(batch.expiry_date).toLocaleDateString('en-GB')}`;
    }
    return null;
}

// Server-paginated, server-searched inventory query.
// Returns a flat list of "batch-like" rows for billing UI compatibility:
// - one row per (medicine, batch) for medicines that have in-stock batches
// - one synthetic catalog row per medicine that has no in-stock batches
//
// The previous getInventory() loaded 500 + 1000 rows on every billing
// page mount and polled every 15s. Use getInventoryPage with a search
// string instead — the billing combobox calls it on each debounced
// keystroke.
export async function getInventoryPage(opts?: {
    search?: string;
    cursor?: number;
    limit?: number;
    inStockOnly?: boolean;
    category?: string;
    stockStatus?: 'in' | 'low' | 'out';
    expiringWithinDays?: number;
    includeSummary?: boolean;
}) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_CATALOG_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();
        const search = (opts?.search ?? '').trim();
        const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
        const inStockOnly = opts?.inStockOnly ?? false;

        const medWhere: any = { is_active: true };
        if (search) {
            const words = search.split(/\s+/).filter(Boolean);
            if (words.length > 0) {
                medWhere.AND = words.map(word => ({
                    OR: [
                        { brand_name: { contains: word, mode: 'insensitive' } },
                        { generic_name: { contains: word, mode: 'insensitive' } },
                    ]
                }));
            }
        }
        if (opts?.category) medWhere.category = opts.category;
        if (opts?.cursor) medWhere.id = { gt: opts.cursor };

        const medicines = await db.pharmacy_medicine_master.findMany({
            where: medWhere,
            orderBy: { brand_name: 'asc' },
            take: limit,
            select: {
                id: true,
                brand_name: true,
                generic_name: true,
                category: true,
                min_threshold: true,
                selling_price: true,
                price_per_unit: true,
                mrp: true,
                gst_percent: true,
                tax_rate: true,
                hsn_sac_code: true,
                pack: true,
                is_active: true,
                batches: {
                    where: { current_stock: { gt: 0 } },
                    orderBy: { expiry_date: 'asc' },
                    select: {
                        id: true,
                        batch_no: true,
                        current_stock: true,
                        expiry_date: true,
                        mrp: true,
                        cost_price: true,
                        rack_location: true,
                    },
                },
            },
        });

        const expiryCutoff = opts?.expiringWithinDays
            ? new Date(Date.now() + opts.expiringWithinDays * 24 * 60 * 60 * 1000)
            : null;

        const flat: any[] = [];
        for (const med of medicines as any[]) {
            const totalStock = med.batches.reduce((s: number, b: any) => s + b.current_stock, 0);
            const isLow = totalStock <= med.min_threshold;
            const isOut = totalStock === 0;

            if (opts?.stockStatus === 'out' && !isOut) continue;
            if (opts?.stockStatus === 'low' && !isLow) continue;
            if (opts?.stockStatus === 'in' && (isLow || isOut)) continue;

            const medicinePayload = {
                brand_name: med.brand_name,
                generic_name: med.generic_name,
                category: med.category,
                min_threshold: med.min_threshold,
                selling_price: med.selling_price,
                price_per_unit: med.price_per_unit,
                mrp: med.mrp,
                gst_percent: med.gst_percent,
                tax_rate: med.tax_rate,
                hsn_sac_code: med.hsn_sac_code,
                pack: med.pack,
                is_active: med.is_active,
            };

            let batchesToShow = med.batches;
            if (expiryCutoff) {
                batchesToShow = batchesToShow.filter((b: any) => new Date(b.expiry_date) <= expiryCutoff);
                if (batchesToShow.length === 0) continue;
            }

            if (batchesToShow.length > 0) {
                for (const b of batchesToShow) {
                    flat.push({
                        id: b.id,
                        batch_no: b.batch_no,
                        medicine_id: med.id,
                        current_stock: b.current_stock,
                        expiry_date: b.expiry_date,
                        cost_price: b.cost_price,
                        mrp: b.mrp ?? med.mrp,
                        rack_location: b.rack_location,
                        medicine: medicinePayload,
                        _lowStock: isLow,
                    });
                }
            } else if (!inStockOnly && !expiryCutoff) {
                flat.push({
                    id: null,
                    batch_no: `CATALOG-${med.id}`,
                    medicine_id: med.id,
                    current_stock: 0,
                    expiry_date: null,
                    rack_location: null,
                    medicine: medicinePayload,
                    _catalog: true,
                    _lowStock: true,
                });
            }
        }

        const nextCursor = medicines.length === limit ? (medicines[medicines.length - 1] as any).id : undefined;

        let summary: { totalValue: number; lowStockCount: number; expiringSoonCount: number; outOfStockCount: number } | undefined;
        if (opts?.includeSummary) {
            const summaryRows = await db.$queryRaw<Array<{
                total_value: number | null;
                low_stock_count: number;
                expiring_soon_count: number;
                out_of_stock_count: number;
            }>>`
                SELECT
                    COALESCE(SUM(b.current_stock * COALESCE(b.cost_price, 0)), 0)::float AS total_value,
                    COUNT(DISTINCT CASE WHEN agg.total_stock <= m.min_threshold AND agg.total_stock > 0 THEN m.id END)::int AS low_stock_count,
                    COUNT(DISTINCT CASE WHEN b.expiry_date <= NOW() + INTERVAL '30 days' AND b.current_stock > 0 THEN b.id END)::int AS expiring_soon_count,
                    COUNT(DISTINCT CASE WHEN agg.total_stock = 0 OR agg.total_stock IS NULL THEN m.id END)::int AS out_of_stock_count
                FROM "pharmacy_medicine_master" m
                LEFT JOIN "pharmacy_batch_inventory" b ON b.medicine_id = m.id
                LEFT JOIN (
                    SELECT medicine_id, COALESCE(SUM(current_stock), 0) AS total_stock
                    FROM "pharmacy_batch_inventory"
                    GROUP BY medicine_id
                ) agg ON agg.medicine_id = m.id
                WHERE m."organizationId" = ${organizationId}
                  AND m.is_active = true
            `;
            summary = {
                totalValue: Number(summaryRows[0]?.total_value || 0),
                lowStockCount: Number(summaryRows[0]?.low_stock_count || 0),
                expiringSoonCount: Number(summaryRows[0]?.expiring_soon_count || 0),
                outOfStockCount: Number(summaryRows[0]?.out_of_stock_count || 0),
            };
        }

        return { success: true, data: flat, nextCursor, summary };
    } catch (error) {
        console.error('Inventory Page Fetch Error:', error);
        return { success: false, data: [] };
    }
}

export async function getInventoryCategories() {
    const denied = await denyUnlessPharmacyRole(PHARMACY_CATALOG_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();
        const rows = await db.pharmacy_medicine_master.findMany({
            where: { is_active: true, category: { not: null } },
            distinct: ['category'],
            select: { category: true },
            orderBy: { category: 'asc' },
        });
        return { success: true, data: rows.map((r: any) => r.category).filter(Boolean) as string[] };
    } catch (error) {
        console.error('Get Inventory Categories Error:', error);
        return { success: false, data: [] };
    }
}

export async function updateBatchDetails(data: {
    batch_id: number;
    batch_no?: string;
    expiry_date?: Date;
    rack_location?: string;
    mrp?: number;
    cost_price?: number;
}) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();

        const batch = await db.pharmacy_batch_inventory.findUnique({
            where: { id: data.batch_id },
            include: { medicine: { select: { organizationId: true } } },
        });
        if (!batch || batch.medicine.organizationId !== organizationId) {
            return { success: false, error: 'Batch not found' };
        }

        const updateData: any = {};
        if (data.batch_no !== undefined) updateData.batch_no = data.batch_no;
        if (data.expiry_date !== undefined) updateData.expiry_date = data.expiry_date;
        if (data.rack_location !== undefined) updateData.rack_location = data.rack_location;
        if (data.mrp !== undefined) updateData.mrp = data.mrp;
        if (data.cost_price !== undefined) updateData.cost_price = data.cost_price;

        const updated = await db.pharmacy_batch_inventory.update({
            where: { id: data.batch_id },
            data: updateData,
        });

        await logAudit({
            action: 'PHARMACY_BATCH_DETAILS_UPDATED',
            module: 'Pharmacy',
            entity_type: 'pharmacy_batch_inventory',
            entity_id: String(data.batch_id),
            details: JSON.stringify(updateData),
        });

        invalidatePharmacyTags(['stock', 'catalog']);
        revalidatePath('/pharmacy/inventory');
        return { success: true, batch: updated };
    } catch (error: any) {
        console.error('Update Batch Details Error:', error);
        return { success: false, error: error.message || 'Failed to update batch' };
    }
}

/**
 * @deprecated Use getInventoryPage with a search string. Kept for callers not yet migrated.
 * No role guard of its own on purpose — it is a pure delegation, so it inherits
 * getInventoryPage's PHARMACY_CATALOG_ROLES check.
 */
export async function getInventory() {
    return getInventoryPage({ limit: 100 });
}

// Full medicine catalogue for the Purchase Order screen.
//
// The PO page loads the list once and does all searching / bulk-select /
// low-stock detection client-side, so it needs EVERY active medicine — not
// the 100-row page cap that getInventory() applies. Returns one row per
// medicine (not per batch) with the total in-stock quantity and reorder
// threshold so the PO UI can flag low stock correctly.
export async function getInventoryForPO() {
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();

        const medicines = await db.pharmacy_medicine_master.findMany({
            where: { is_active: true },
            orderBy: { brand_name: 'asc' },
            select: {
                id: true,
                brand_name: true,
                generic_name: true,
                selling_price: true,
                price_per_unit: true,
                mrp: true,
                gst_percent: true,
                tax_rate: true,
                hsn_sac_code: true,
                min_threshold: true,
                batches: {
                    where: { current_stock: { gt: 0 } },
                    select: { current_stock: true },
                },
            },
        });

        const data = medicines.map((med: any) => ({
            medicine_id: med.id,
            brand_name: med.brand_name,
            generic_name: med.generic_name,
            selling_price: med.selling_price,
            price_per_unit: med.price_per_unit,
            mrp: med.mrp,
            gst_percent: med.gst_percent,
            tax_rate: med.tax_rate,
            hsn_sac_code: med.hsn_sac_code,
            min_threshold: med.min_threshold,
            current_stock: med.batches.reduce((s: number, b: any) => s + b.current_stock, 0),
        }));

        return { success: true, data };
    } catch (error) {
        console.error('PO Inventory Fetch Error:', error);
        return { success: false, data: [] };
    }
}

export async function generateInvoice(
    patientId: string,
    items: any[],
    optionsOrWalkInName?: string | { walkInName?: string; walkInContact?: string; walkInAddress?: string; billDateTime?: string; doctorId?: string; doctorName?: string; paymentMethod?: string; discount?: number; discountPct?: number }
) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId, session } = await requireTenantContext();
        const rawOptions = typeof optionsOrWalkInName === 'string'
            ? { walkInName: optionsOrWalkInName }
            : (optionsOrWalkInName || {});
        // Default doctor to "Self" (counter sale / over-the-counter / pharmacist-led) when
        // the cashier doesn't pick one. Stored verbatim so the print shows "Dr. Self".
        const options = {
            ...rawOptions,
            doctorName: rawOptions.doctorName?.trim() || 'Self',
        };
        const walkInName = options.walkInName;
        const paymentMethod = options.paymentMethod || 'Cash';
        // Optional bill-level discount for walk-in/OTC counter sales; line
        // prices/tax stay untouched. A percentage (discountPct) is preferred and
        // takes priority; a flat ₹ amount (discount) is kept as a fallback.
        const billDiscountPct = Math.min(Math.max(0, Number((options as any).discountPct) || 0), 100);
        const flatDiscount = Math.max(0, Number((options as any).discount) || 0);
        // For walk-in/OTC sales the customer's name and optional contact/address
        // (if the cashier entered them) are stored on the invoice itself, since
        // all walk-ins share one OPD_REG record.
        const walkInLabel = patientId === 'WALKIN'
            ? buildWalkinNote(walkInName, (options as any).walkInContact, (options as any).walkInAddress)
            : undefined;

        // Validate optional backdated bill date.
        const backdateResult = validateBackdate(options.billDateTime, { label: 'Bill date' });
        if (!backdateResult.ok) {
            return { success: false, error: backdateResult.error };
        }
        const backdatedAt = backdateResult.date;

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
            // medicine_id arrives straight from the client cart. Nothing else on
            // this path checks it, and pharmacy_batch_inventory is not
            // tenant-scoped, so an id belonging to another hospital would have
            // dispensed THEIR stock. Prove ownership before touching any batch.
            const ownedMedicine = await db.pharmacy_medicine_master.findFirst({
                where: { id: item.medicine_id, organizationId },
                select: { id: true, brand_name: true },
            });
            if (!ownedMedicine) {
                return { success: false, error: 'One of the items is not in this hospital\'s medicine catalogue. Remove it and try again.' };
            }

            // FEFO: select earliest non-expired batch if batch_no not specified
            const batchWhere: any = { medicine_id: item.medicine_id, current_stock: { gte: item.quantity }, expiry_date: { gt: new Date() }, is_quarantined: false };
            if (item.batch_no) batchWhere.batch_no = item.batch_no;
            const batch = await db.pharmacy_batch_inventory.findFirst({
                where: batchWhere,
                include: { medicine: true },
                orderBy: { expiry_date: 'asc' }, // FEFO
            });

            // No dispensable batch. That is only legitimate when the medicine has
            // NO stock rows at all (a catalogue-only item the pharmacist prices at
            // the counter). If batches DO exist and merely fail the filter —
            // expired, quarantined, or not enough in the one batch — the old code
            // fell through to the catalogue branch below and billed the patient
            // with no stock deduction, no movement row and no warning. Refuse, and
            // say which of the three it was.
            if (!batch) {
                const stockRows = await db.pharmacy_batch_inventory.findMany({
                    where: { medicine_id: item.medicine_id, ...(item.batch_no ? { batch_no: item.batch_no } : {}) },
                    select: { batch_no: true, current_stock: true, expiry_date: true, is_quarantined: true },
                });
                if (stockRows.length > 0) {
                    const name = ownedMedicine.brand_name;
                    const dispensable = stockRows
                        .filter((b: any) => !batchDispenseBlocker(b))
                        .reduce((s: number, b: any) => s + b.current_stock, 0);
                    if (dispensable === 0) {
                        const why = stockRows.map((b: any) => batchDispenseBlocker(b)).find(Boolean) || 'is out of stock';
                        return { success: false, error: `Cannot sell ${name}: every batch in stock ${why}. Write it off under Returns, or receive fresh stock first.` };
                    }
                    return {
                        success: false,
                        error: `Cannot sell ${item.quantity} × ${name} from a single batch — only ${dispensable} unit(s) are dispensable and they are split across batches. Add each batch to the cart separately.`,
                    };
                }
            }

            if (batch && batch.current_stock >= item.quantity) {
                const updatedBatch = await db.pharmacy_batch_inventory.update({
                    where: { id: batch.id },
                    data: { current_stock: { decrement: item.quantity } }
                });

                // Use the price edited by the pharmacist in the cart (item.unit_price),
                // then batch MRP (the actual per-unit selling price on that batch),
                // then medicine master selling_price / price_per_unit as final fallback.
                const unitPrice = (item.unit_price !== undefined && Number(item.unit_price) > 0)
                    ? Number(item.unit_price)
                    : (Number(batch.mrp) || Number(batch.medicine.selling_price) || Number(batch.medicine.price_per_unit) || 0);
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
                    // Batch MRP is the printed pack price for THIS strip; the medicine
                    // master value is only a fallback for batches loaded without one.
                    mrp: Number(batch.mrp) || Number(batch.medicine.mrp) || unitPrice,
                    batch_no: batch.batch_no,
                    batch_id: batch.id,
                    expiry_date: batch.expiry_date,
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
                            patient_id: !['WALKIN', 'HOSPITAL'].includes(patientId) ? patientId : null,
                            quantity_in: 0,
                            quantity_out: item.quantity,
                            balance: (lastEntry?.balance || 0) - item.quantity,
                            transaction_type: 'OUT',
                            source_type: 'DISPENSE',
                            notes: `Counter sale dispense`,
                        }
                    });
                }
            } else {
                // Catalog-only sale — no batch/stock exists.
                // Pharmacist sets price at billing time; no stock deduction needed.
                const medicine = await db.pharmacy_medicine_master.findUnique({
                    where: { id: item.medicine_id }
                });
                if (!medicine) continue; // skip unknown medicine

                const unitPrice = (item.unit_price !== undefined && Number(item.unit_price) > 0)
                    ? Number(item.unit_price)
                    : (Number(medicine.mrp) || Number(medicine.selling_price) || Number(medicine.price_per_unit) || 0);
                const netPrice = unitPrice * item.quantity;
                const taxRate = Number(medicine.gst_percent) || Number(medicine.tax_rate) || 0;
                const taxAmount = netPrice * taxRate / 100;

                totalAmount += netPrice;
                totalTax += taxAmount;

                invoiceItems.push({
                    medicine_name: medicine.brand_name,
                    medicine_id: medicine.id,
                    qty: item.quantity,
                    unit_price: unitPrice,
                    net_price: netPrice,
                    tax_rate: taxRate,
                    tax_amount: taxAmount,
                    hsn_sac_code: medicine.hsn_sac_code || '3004',
                    mrp: Number(medicine.mrp) || unitPrice,
                    batch_no: 'N/A',
                    batch_id: null,
                    expiry_date: null, // catalog-only sale — no physical batch, so no expiry
                    batch_cost: 0,
                });
            }
        }

        if (invoiceItems.length === 0) {
            return { success: false, error: 'No items could be dispensed — check stock levels and batch numbers' };
        }

        // 2. Ensure special patient records exist
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
        } else if (patientId === 'HOSPITAL') {
            await db.oPD_REG.upsert({
                where: { patient_id: 'HOSPITAL' },
                create: {
                    patient_id: 'HOSPITAL',
                    full_name: 'Hospital Internal Use',
                    organizationId,
                },
                update: {}
            });
        }

        // 2.5 IPD AUTO-LINK: if this patient is currently admitted, post the
        // dispensed medicines as line items on their active IPD bill.
        // For ALL payment methods (Cash/Card/UPI/Credit), post to the IPD bill.
        // The IPD invoice already tracks balance_due and is visible at reception.
        // No separate PHM invoice is created for IPD patients.
        if (patientId !== 'WALKIN') {
            const activeAdmission = await db.admissions.findFirst({
                where: { patient_id: patientId, status: 'Admitted', organizationId },
                select: { admission_id: true },
            });
            if (activeAdmission) {
                // Doctor name is already shown in the bill header — don't repeat
                // it on every pharmacy line item (client feedback: clutters the bill).
                const dispensedAt = backdatedAt || new Date();
                const chargeFailures: string[] = [];
                for (const item of invoiceItems) {
                    const chargeResult = await postChargeToIpdBill({
                        admission_id: activeAdmission.admission_id,
                        source_module: 'pharmacy',
                        source_ref_id: `PHARM-COUNTER-${item.medicine_id}-${item.batch_no}-${Date.now()}`,
                        description: `Pharmacy: ${item.medicine_name} (Batch ${item.batch_no}) × ${item.qty}`,
                        quantity: item.qty,
                        unit_price: item.unit_price,
                        tax_rate: item.tax_rate,
                        hsn_sac_code: item.hsn_sac_code,
                        service_category: 'Pharmacy',
                        posted_at: dispensedAt,
                        batch_no: item.batch_no,
                        expiry_date: item.expiry_date,
                        mrp: item.mrp,
                    });
                    if (!chargeResult?.success) {
                        chargeFailures.push(`${item.medicine_name}: ${chargeResult?.error || 'failed to post charge'}`);
                    }
                }

                if (chargeFailures.length > 0) {
                    // Stock is already deducted at this point (loop above) — report the
                    // failure instead of claiming success so it isn't lost silently.
                    return {
                        success: false,
                        error: `Stock was dispensed but failed to post to the IPD bill for: ${chargeFailures.join('; ')}. An Admin/Finance user must add these charges manually.`,
                        ipd_posted: false,
                    };
                }

                const netAmount = totalAmount + totalTax;

                await logAudit({
                    action: paymentMethod === 'Credit' ? 'PHARMACY_CREDIT_POSTED_TO_IPD' : 'PHARMACY_POSTED_TO_IPD',
                    module: 'Pharmacy',
                    entity_type: 'admission',
                    entity_id: activeAdmission.admission_id,
                    details: JSON.stringify({
                        patientId,
                        admission_id: activeAdmission.admission_id,
                        itemCount: invoiceItems.length,
                        total: netAmount,
                        paymentMethod,
                    }),
                });

                revalidatePath('/pharmacy/billing');
                revalidatePath('/reception/ipd');
                return {
                    success: true,
                    total: netAmount,
                    subtotal: totalAmount,
                    tax: totalTax,
                    cgst: totalTax / 2,
                    sgst: totalTax / 2,
                    ipd_admission_id: activeAdmission.admission_id,
                    ipd_posted: true,
                    credit_bill: paymentMethod === 'Credit',
                    items: invoiceItems,
                    message: paymentMethod === 'Credit'
                        ? `Posted to IPD bill (${activeAdmission.admission_id}) as credit — collect at discharge.`
                        : `Posted to IPD bill of admission ${activeAdmission.admission_id}.`,
                };
            }
        }

        // 3. Create formal invoice in finance system
        const grossAmount = totalAmount + totalTax;
        // Percentage discount takes priority; fall back to a flat ₹ amount.
        // Clamp so it can never exceed the bill or go negative.
        const rawDiscount = billDiscountPct > 0 ? grossAmount * billDiscountPct / 100 : flatDiscount;
        const appliedDiscount = Math.min(Math.max(0, rawDiscount), grossAmount);
        const netAmount = grossAmount - appliedDiscount;
        const cgst = totalTax / 2;
        const sgst = totalTax / 2;

        const isCreditSale = paymentMethod === 'Credit';

        const invoice = await db.invoices.create({
            data: {
                invoice_number: await generateSequentialNumber(organizationId, 'PHM', db),
                patient_id: patientId,
                invoice_type: 'Pharmacy',
                status: 'Final',
                total_amount: totalAmount,
                total_discount: appliedDiscount,
                bill_discount: appliedDiscount,
                net_amount: netAmount,
                paid_amount: isCreditSale ? 0 : netAmount,
                balance_due: isCreditSale ? netAmount : 0,
                total_tax: totalTax,
                cgst_amount: cgst,
                sgst_amount: sgst,
                igst_amount: 0,
                is_inter_state: false,
                notes: walkInLabel || undefined,
                organizationId,
                ...(backdatedAt ? { created_at: backdatedAt } : {}),
                ...(options.doctorId ? { doctor_id: options.doctorId } : {}),
                ...(options.doctorName ? { doctor_name: options.doctorName } : {}),
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
                    batch_no: item.batch_no,
                    expiry_date: item.expiry_date,
                    mrp: item.mrp,
                    organizationId,
                }
            });
        }

        let payment = null;
        if (!isCreditSale) {
            // Record a Payment record immediately since OPD pharmacy collects payment on generate
            payment = await db.payments.create({
                data: {
                    receipt_number: await genRcpNum(organizationId, db),
                    invoice_id: invoice.id,
                    amount: netAmount,
                    payment_method: paymentMethod,
                    payment_type: 'Full',
                    status: 'Completed',
                    received_by: session?.username || session?.name || null,
                    organizationId,
                    ...(backdatedAt ? { created_at: backdatedAt } : {}),
                }
            });
        }

        // Referral + doctor commission accrue on the collected pharmacy bill (best-effort)
        try {
            const { recomputeInvoiceCommission } = await import('@/app/lib/referral-commission');
            await recomputeInvoiceCommission(db, organizationId, invoice.id);
            const { recomputeInvoiceDoctorCommission } = await import('@/app/lib/doctor-commission');
            await recomputeInvoiceDoctorCommission(db, organizationId, invoice.id);
        } catch (e) {
            console.error('referral commission recompute failed (pharmacy):', e);
        }

        // 4. Post to GL and GST register
        await postInvoiceToGL(invoice.id).catch(err =>
            console.error('GL posting failed for pharmacy invoice:', invoice.id, err)
        );
        await syncInvoiceToGSTRegister(invoice.id).catch(err =>
            console.error('GST sync failed for pharmacy invoice:', invoice.id, err)
        );
        if (payment) {
            const { postPaymentToGL } = await import('@/app/actions/gl-actions');
            postPaymentToGL(payment.id).catch(err =>
                console.error('GL payment posting failed for pharmacy invoice:', payment.id, err)
            );
        }

        // 5. Audit log
        await logAudit({
            action: 'PHARMACY_INVOICE_CREATED',
            module: 'Pharmacy',
            entity_type: 'invoice',
            entity_id: invoice.invoice_number,
            details: JSON.stringify({
                total: netAmount,
                itemCount: invoiceItems.length,
                patientId,
                backdated: !!backdatedAt,
                billDateTime: backdatedAt ? backdatedAt.toISOString() : undefined,
                doctorId: options.doctorId || undefined,
                doctorName: options.doctorName || undefined,
                paymentMethod,
            }),
        });

        revalidatePath('/pharmacy/billing');
        invalidatePharmacyTags(['stock', 'orders']);
        return {
            success: true,
            total: netAmount,
            subtotal: totalAmount,
            tax: totalTax,
            discount: appliedDiscount,
            discount_pct: billDiscountPct,
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
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

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
            // If medicine_id is missing, try to find it by name
            let medicineId = item.medicine_id;
            if (!medicineId) {
                const med = await db.pharmacy_medicine_master.findFirst({
                    where: { brand_name: { equals: item.medicine_name, mode: 'insensitive' } }
                });
                if (!med) {
                    return { success: false, error: `Medicine "${item.medicine_name}" not found in inventory. Please add it first.` };
                }
                medicineId = med.id;
            }

            const batches = await db.pharmacy_batch_inventory.findMany({
                where: dispensableBatchWhere(medicineId),
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
                medicine_id: medicineId,
                batch_no: batch.batch_no,
                quantity: item.quantity_requested
            });
        }

        // 3. Call dispenseMedicine (Atomic)
        const dispenseRes = await dispenseMedicine(orderId, dispenseItems);
        if (!dispenseRes.success) return dispenseRes;

        // 4. Mark as paid if it's an OPD patient (IPD is handled by dispenseMedicine → postChargeToIpdBill)
        if (!dispenseRes.ipd_posted) {
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
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();

        // Statuses that still represent OUTSTANDING work for the pharmacist.
        //
        // 'Verified' and 'Dispensing' were missing, which silently broke the whole
        // IPD indent workflow: a nurse raises an indent (Pending) -> pharmacist hits
        // Verify -> verifyPharmacyOrder sets status='Verified' -> the order instantly
        // dropped out of this query and vanished from BOTH /pharmacy/orders and
        // /pharmacy/ip-orders, so it could never be dispensed. The Dispense button in
        // ip-orders/page.tsx is written for exactly `status === 'Verified' ||
        // 'Dispensing'` and was therefore unreachable code. Found in production with
        // 16 indents for one admission stranded this way.
        //
        // 'Completed'/'Dispensed' stay out on purpose — that work is genuinely done.
        const orders = await db.pharmacy_orders.findMany({
            where: { status: { in: ['Pending', 'Ordered', 'Verified', 'Dispensing', 'Processed'] } },
            orderBy: { created_at: 'desc' },
            include: { items: true },
            take: 100, // most recent 100 outstanding orders
        });

        // Manual Join for Patient Details (since relation is missing in schema)
        const patientIds = Array.from(new Set(orders.map((o: any) => o.patient_id))) as string[];
        const patients = patientIds.length > 0 ? await db.oPD_REG.findMany({
            where: { patient_id: { in: patientIds } },
            select: { patient_id: true, full_name: true, phone: true },
        }) : [];

        // Ward / bed for the indent-requisition header — resolved from the
        // admission (pharmacy_orders has no ward column of its own).
        const admissionIds = Array.from(new Set(
            orders.map((o: any) => o.admission_id).filter(Boolean)
        )) as string[];
        const admissions = admissionIds.length > 0 ? await db.admissions.findMany({
            where: { admission_id: { in: admissionIds } },
            select: {
                admission_id: true,
                bed: { select: { bed_name: true, wards: { select: { ward_name: true } } } },
                ward: { select: { ward_name: true } },
            },
        }) : [];
        const wardByAdmission = new Map<string, string>();
        for (const a of admissions) {
            const wardName = a.ward?.ward_name || a.bed?.wards?.ward_name || '';
            const bed = a.bed?.bed_name ? ` - ${a.bed.bed_name}` : '';
            wardByAdmission.set(a.admission_id, `${wardName}${bed}`.trim() || '—');
        }

        // Collect all medicine names from order items to check stock
        const allMedicineNames = Array.from(new Set(
            orders.flatMap((o: any) => o.items.map((i: any) => i.medicine_name))
        ));

        // Fetch stock info for all medicines in these orders
        const medicines = allMedicineNames.length > 0 ? await db.pharmacy_medicine_master.findMany({
            where: { brand_name: { in: allMedicineNames as string[] } },
            select: {
                brand_name: true,
                min_threshold: true,
                selling_price: true,
                price_per_unit: true,
                batches: {
                    // Must match what the allocators will actually hand out
                    // (dispensableBatchWhere). Counting expired stock here made the
                    // ward screen show more than could be dispensed, and the
                    // pharmacist's typed quantity then overflowed into a manual
                    // override — charged to the patient with no stock deducted.
                    where: { current_stock: { gt: 0 }, is_quarantined: false, expiry_date: { gt: new Date() } },
                    select: { current_stock: true, mrp: true },
                    orderBy: { expiry_date: 'asc' },   // FEFO — same batch dispenseMedicine will price from
                },
            },
        }) : [];

        const stockMap = new Map<string, { totalStock: number; status: 'In Stock' | 'Low Stock' | 'Out of Stock' }>();
        // Indicative rate for an indent line that hasn't been dispensed yet, so the
        // pharmacist sees a value BEFORE dispensing (unit_price is only written at
        // dispense time). Same precedence dispenseMedicine uses: earliest-expiry
        // batch MRP → selling_price → price_per_unit.
        const estPriceMap = new Map<string, number>();
        for (const med of medicines) {
            const batches = med.batches as any[];
            const totalStock = batches.reduce((sum: number, b: any) => sum + b.current_stock, 0);
            stockMap.set(med.brand_name, {
                totalStock,
                status: totalStock === 0 ? 'Out of Stock' : totalStock <= med.min_threshold ? 'Low Stock' : 'In Stock',
            });
            const batchMrp = Number(batches.find((b: any) => Number(b.mrp) > 0)?.mrp || 0);
            const est = batchMrp || Number(med.selling_price) || Number(med.price_per_unit) || 0;
            if (est > 0) estPriceMap.set(med.brand_name, est);
        }

        const ordersWithPatient = orders.map((order: any) => {
            const itemsWithStock = order.items.map((item: any) => ({
                ...item,
                stock: stockMap.get(item.medicine_name) || { totalStock: 0, status: 'Out of Stock' },
                est_price: estPriceMap.get(item.medicine_name) ?? null,
            }));
            const hasOutOfStock = itemsWithStock.some((i: any) => i.stock.status === 'Out of Stock');
            const hasLowStock = itemsWithStock.some((i: any) => i.stock.status === 'Low Stock');
            return {
                ...order,
                items: itemsWithStock,
                patient: patients.find((p: any) => p.patient_id === order.patient_id) || null,
                ward: order.admission_id ? (wardByAdmission.get(order.admission_id) || '—') : '—',
                stockWarning: hasOutOfStock ? 'Out of Stock' : hasLowStock ? 'Low Stock' : null,
                pharmacyBalance: 0,
            };
        });

        return { success: true, data: ordersWithPatient };
    } catch (error) {
        console.error('Pharmacy Queue Error:', error);
        return { success: false, data: [] };
    }
}

export async function markOrderAsPaid(orderId: number, paymentMethod: string = 'Cash') {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId, session } = await requireTenantContext();

        const order = await db.pharmacy_orders.findUnique({ where: { id: orderId } });
        if (!order) return { success: false, error: 'Order not found' };

        // If order has a linked invoice, record payment against it
        if (order.invoice_id) {
            const invoice = await db.invoices.findUnique({ where: { id: order.invoice_id } });
            if (invoice && Number(invoice.balance_due) > 0) {
                const payAmount = Number(invoice.balance_due);
                const payment = await db.payments.create({
                    data: {
                        receipt_number: await genRcpNum(organizationId, db),
                        invoice_id: invoice.id,
                        amount: payAmount,
                        payment_method: paymentMethod,
                        payment_type: 'Full',
                        status: 'Completed',
                        received_by: session?.username || session?.name || null,
                    }
                });

                await db.invoices.update({
                    where: { id: invoice.id },
                    data: {
                        paid_amount: Number(invoice.paid_amount) + payAmount,
                        balance_due: 0,
                    }
                });

                // Post payment to GL (non-blocking)
                const { postPaymentToGL } = await import('@/app/actions/gl-actions');
                postPaymentToGL(payment.id).catch(err =>
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
    rack: string,
    // HSN/SAC for GST. Lives on pharmacy_medicine_master (a property of the
    // product), not on the batch — so this writes through to the medicine.
    hsn_sac_code?: string,
    // Pack size ("10", "1x10", "100ML"). Same deal as HSN — product-level, written
    // through to the medicine master, and printed in the bill's PACK column.
    pack?: string,
    // Purchase cost per unit. Inventory valuation (and therefore the Stock Value
    // KPI) sums cost_price, so a batch added without one values at zero.
    cost_price?: number
}) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId, session } = await requireTenantContext();

        // Stock that is already expired must never enter the shelf: it would be
        // counted in stock value, offered in the billing picker, and (before the
        // FEFO fix) sorted to the front of every allocator.
        const expiry = new Date(data.expiry);
        if (isNaN(expiry.getTime())) return { success: false, error: 'Enter a valid expiry date.' };
        if (expiry <= new Date()) {
            return { success: false, error: `Expiry ${expiry.toLocaleDateString('en-GB')} is in the past — this stock cannot be received.` };
        }
        if (!(Number(data.stock) > 0)) return { success: false, error: 'Enter a quantity greater than zero.' };

        // Normalise defensively: the client already uppercases/strips, but this
        // action is callable directly. Empty string -> undefined so we never
        // blank out an existing code with a blank submission.
        const hsn = data.hsn_sac_code?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || undefined;
        const pack = data.pack?.trim().slice(0, 32) || undefined;

        let medicineId = data.medicine_id;

        // If no explicit medicine_id, reuse an existing master entry for this
        // brand (the inventory grid is full of master rows that have no batches
        // yet) — otherwise the unique [brand_name, organizationId] constraint
        // would reject the create and the whole add would fail.
        if (!medicineId && data.brand_name) {
            const existing = await db.pharmacy_medicine_master.findFirst({
                where: { brand_name: data.brand_name, organizationId },
                select: { id: true },
            });

            if (existing) {
                medicineId = existing.id;
            } else {
                const newMed = await db.pharmacy_medicine_master.create({
                    data: {
                        brand_name: data.brand_name,
                        generic_name: data.generic_name || '',
                        mrp: data.price,
                        selling_price: data.price,
                        price_per_unit: data.price,
                        hsn_sac_code: hsn ?? null,
                        pack: pack ?? null,
                        organizationId,
                    }
                });
                medicineId = newMed.id;
            }
        }

        if (!medicineId) return { success: false, error: 'Invalid Medicine ID' };

        // Backfill HSN onto an existing medicine when one was supplied. Only ~9 of
        // 13k medicines currently carry an HSN, and this form is where pharmacy
        // staff actually work, so let them fill it in as stock arrives. Guarded on
        // `hsn` being truthy so a blank field never wipes an existing code.
        // Same for pack size — blank never wipes an existing value.
        if (hsn || pack) {
            await db.pharmacy_medicine_master.updateMany({
                where: { id: medicineId, organizationId },
                data: { ...(hsn ? { hsn_sac_code: hsn } : {}), ...(pack ? { pack } : {}) },
            });
        }

        // Top up when this batch_no already exists for the medicine, rather than
        // failing the unique constraint — but a batch number identifies ONE
        // physical lot with ONE expiry, so a mismatched date is a data-entry
        // mistake, not a top-up. Overwriting it (as this used to) silently
        // re-dated stock already sitting on the shelf.
        const existingBatch = await db.pharmacy_batch_inventory.findUnique({
            where: { medicine_id_batch_no: { medicine_id: medicineId, batch_no: data.batch_no } },
            select: { id: true, expiry_date: true, current_stock: true },
        });
        if (existingBatch) {
            const sameDay = new Date(existingBatch.expiry_date).toDateString() === expiry.toDateString();
            if (!sameDay) {
                return {
                    success: false,
                    error: `Batch ${data.batch_no} already exists with expiry ${new Date(existingBatch.expiry_date).toLocaleDateString('en-GB')}. A batch number can only have one expiry — correct the date, or use a different batch number.`,
                };
            }
        }

        const batch = await db.pharmacy_batch_inventory.upsert({
            where: { medicine_id_batch_no: { medicine_id: medicineId, batch_no: data.batch_no } },
            create: {
                medicine_id: medicineId,
                batch_no: data.batch_no,
                current_stock: data.stock,
                expiry_date: expiry,
                rack_location: data.rack,
                mrp: data.price,
                ...(data.cost_price != null ? { cost_price: data.cost_price, actual_cost: data.cost_price } : {}),
            },
            update: {
                current_stock: { increment: data.stock },
                rack_location: data.rack,
                mrp: data.price,
                ...(data.cost_price != null ? { cost_price: data.cost_price, actual_cost: data.cost_price } : {}),
            },
        });

        // Manual receipts were invisible to the movement ledger (only GRN wrote to
        // it), so the stock ledger never reconciled against actual shelf stock.
        await db.pharmacyInventoryMovement.create({
            data: {
                organizationId,
                medicine_id: medicineId,
                batch_id: batch.id,
                movement_type: 'PURCHASE',
                quantity_in: data.stock,
                unit_cost: Number(data.cost_price ?? 0),
                balance_after: batch.current_stock,
                source_type: 'MANUAL_ADD',
                user_id: session?.id,
                reason: 'Manual stock entry',
            },
        });

        // Narcotics and Schedule H1/X drugs must hit the register on the way IN as
        // well as out. receivePurchaseOrder already did this; this path did not, so
        // stock added here made the running balance permanently understated.
        const medicine = await db.pharmacy_medicine_master.findUnique({ where: { id: medicineId } });
        if (medicine && (medicine.is_narcotic || ['H', 'H1', 'X', 'NDPS'].includes(medicine.drug_schedule || ''))) {
            const lastEntry = await db.narcoticRegister.findFirst({
                where: { organizationId, drug_name: medicine.brand_name },
                orderBy: { created_at: 'desc' },
            });
            await db.narcoticRegister.create({
                data: {
                    organizationId,
                    drug_name: medicine.brand_name,
                    medicine_id: medicine.id,
                    batch_no: data.batch_no,
                    batch_id: batch.id,
                    quantity_in: data.stock,
                    quantity_out: 0,
                    balance: (lastEntry?.balance || 0) + data.stock,
                    transaction_type: 'IN',
                    source_type: 'MANUAL_ADD',
                    notes: 'Manual stock entry',
                },
            });
        }

        revalidatePath('/pharmacy/billing');
        revalidatePath('/pharmacy/inventory');
        invalidatePharmacyTags(['stock', 'catalog']);
        return { success: true };
    } catch (error) {
        console.error('Add Inventory Error:', error);
        return { success: false, error: 'Failed to add inventory' };
    }
}

// Check drug interactions for a list of medicine names
export async function checkInteractions(drugNames: string[]) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_CATALOG_ROLES);
    if (denied) return denied;

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

// Cached per (organizationId, midnight bucket). Result is reused for 60s
// across all requests within the same tenant. Invalidated on writes that tag
// pharmacy:stock or pharmacy:orders.
const cachedDashboardStats = (organizationId: string) => unstable_cache(
    async () => {
        const db = getTenantPrisma(organizationId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const [
            pendingOrdersCount,
            expiringBatchesCount,
            todayRevenue,
            lowStockRows,
        ] = await Promise.all([
            db.pharmacy_orders.count({ where: { status: 'Pending' } }),
            db.pharmacy_batch_inventory.count({
                where: {
                    expiry_date: { lte: thirtyDaysFromNow },
                    current_stock: { gt: 0 }
                }
            }),
            db.pharmacy_orders.aggregate({
                _sum: { total_amount: true },
                where: { status: 'Completed', created_at: { gte: today } }
            }),
            db.$queryRaw<Array<{ count: bigint }>>`
                SELECT COUNT(*)::bigint AS count FROM (
                    SELECT m.id
                    FROM "pharmacy_medicine_master" m
                    LEFT JOIN "pharmacy_batch_inventory" b ON b.medicine_id = m.id
                    WHERE m."organizationId" = ${organizationId}
                      AND m.is_active = true
                    GROUP BY m.id, m.min_threshold
                    HAVING COALESCE(SUM(b.current_stock), 0) <= m.min_threshold
                ) low
            `,
        ]);

        return {
            pendingOrders: pendingOrdersCount,
            lowStockAlerts: Number(lowStockRows[0]?.count ?? 0),
            expiringBatches: expiringBatchesCount,
            todayRevenue: Number(todayRevenue._sum.total_amount) || 0,
        };
    },
    ['pharmacy:dashboard-stats', organizationId],
    {
        revalidate: 60,
        tags: ['pharmacy:stock', 'pharmacy:orders', `pharmacy:org:${organizationId}`],
    },
)();

export async function getPharmacyDashboardStats() {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { organizationId } = await requireTenantContext();
        const data = await cachedDashboardStats(organizationId);
        return { success: true, data };
    } catch (error) {
        console.error('Stats Error:', error);
        return { success: false, error: 'Failed' };
    }
}

export async function dispenseMedicine(orderId: number, dispensedItems: any[]) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();

        // Gate on bill status BEFORE touching inventory. Without this, a closed/locked
        // IPD bill causes postChargeToIpdBill to fail silently *after* stock has already
        // been decremented and the order marked Completed below — the medicine looks
        // dispensed but never reaches the invoice.
        const preOrder = await db.pharmacy_orders.findUnique({
            where: { id: orderId },
            select: { patient_id: true, admission_id: true, is_ipd_linked: true },
        });
        if (!preOrder) return { success: false, error: 'Order not found' };

        const preActiveAdmission = preOrder.patient_id ? await db.admissions.findFirst({
            where: { patient_id: preOrder.patient_id, status: 'Admitted', organizationId },
            select: { admission_id: true },
        }) : null;
        const preTargetAdmissionId = preOrder.admission_id || preActiveAdmission?.admission_id;
        const preIsIpdPatient = !!(preOrder.is_ipd_linked || preOrder.admission_id || preActiveAdmission);

        if (preIsIpdPatient && preTargetAdmissionId) {
            const admissionRec = await db.admissions.findUnique({
                where: { admission_id: preTargetAdmissionId },
                select: { status: true },
            });
            if (admissionRec?.status === 'Discharged') {
                return { success: false, error: BILL_FINALIZED_INTENT_MSG };
            }
            const activeInvoice = await db.invoices.findFirst({
                where: { admission_id: preTargetAdmissionId, status: { not: 'Cancelled' } },
                select: { status: true, is_locked: true },
            });
            if (isBillClosedForCharges(activeInvoice)) {
                return { success: false, error: BILL_FINALIZED_INTENT_MSG };
            }
        }

        let totalAmount = 0;
        let totalTax = 0;
        const dispensedDetails: any[] = [];

        // Partial-dispense tracking. When the pharmacist can only supply part of an
        // indent (e.g. 3 of 4 in stock), we still dispense what we have, mark the
        // shortfall per line, and notify the ward. Populated inside the transaction
        // and consumed after it (for the shortage notification + return payload).
        let shortageList: { medicine_name: string; requested: number; dispensed: number; short: number }[] = [];

        // Accumulate dispensed quantity per order item so a single line can be filled
        // from MULTIPLE batches without the per-item update clobbering earlier batches.
        const dispByItem = new Map<number, { qty: number; net: number; tax: number; unitPrice: number; rate: number; hsn: string; batch: string }>();

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

                // Last line of defence before stock moves. The callers above now
                // allocate only from dispensableBatchWhere(), but this function is
                // also reachable with a caller-supplied batch_no (the dispense
                // screen posts one per line), so an expired or quarantined batch
                // must be refused by name here rather than quietly handed over.
                const blocker = batchDispenseBlocker(batch);
                if (blocker) {
                    throw new Error(`Cannot dispense ${batch.medicine.brand_name}: batch ${batch.batch_no} ${blocker}. Pick another batch or write it off under Returns.`);
                }

                const updatedBatch = await tx.pharmacy_batch_inventory.update({
                    where: { id: batch.id },
                    data: { current_stock: { decrement: item.quantity } }
                });

                // Batch MRP (per-unit selling price) takes priority over medicine master prices
                const unitPrice = Number(batch.mrp) || Number(batch.medicine.selling_price) || Number(batch.medicine.price_per_unit) || 0;
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
                    expiry_date: batch.expiry_date,
                    mrp: Number(batch.mrp) || Number(batch.medicine.mrp) || unitPrice,
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

                // Accumulate this batch's contribution to the order item. The actual
                // order-item row is written once, after the loop, from the totals.
                if (item.order_item_id) {
                    const cur = dispByItem.get(item.order_item_id) || { qty: 0, net: 0, tax: 0, unitPrice, rate: taxRate, hsn: batch.medicine.hsn_sac_code || '3004', batch: item.batch_no };
                    cur.qty += item.quantity;
                    cur.net += netPrice;
                    cur.tax += taxAmount;
                    cur.unitPrice = unitPrice;
                    cur.rate = taxRate;
                    cur.hsn = batch.medicine.hsn_sac_code || '3004';
                    cur.batch = item.batch_no;
                    dispByItem.set(item.order_item_id, cur);
                }
            }

            // Write each order item once from the accumulated totals, marking it
            // 'Partial' when we dispensed less than requested.
            const allOrderItems = await tx.pharmacy_order_items.findMany({ where: { order_id: orderId } });
            for (const [itemId, d] of dispByItem) {
                const oi = allOrderItems.find((x: any) => x.id === itemId);
                const requested = oi?.quantity_requested ?? d.qty;
                await tx.pharmacy_order_items.update({
                    where: { id: itemId },
                    data: {
                        quantity_dispensed: d.qty,
                        unit_price: d.unitPrice,
                        total_price: d.net,
                        batch_id: d.batch,
                        tax_rate: d.rate,
                        tax_amount: d.tax,
                        hsn_sac_code: d.hsn,
                        status: d.qty >= requested ? 'Dispensed' : 'Partial',
                    }
                });
            }

            // Any requested item that ended up short (fewer dispensed than requested,
            // including items with no stock at all) becomes a shortage line.
            shortageList = allOrderItems
                .map((oi: any) => {
                    const dispensed = dispByItem.get(oi.id)?.qty ?? 0;
                    const requested = oi.quantity_requested ?? 0;
                    return { medicine_name: oi.medicine_name, requested, dispensed, short: requested - dispensed };
                })
                .filter((s: any) => s.short > 0);

            const fullyComplete = shortageList.length === 0;
            const grandTotal = totalAmount + totalTax;
            await tx.pharmacy_orders.update({
                where: { id: orderId },
                data: {
                    status: fullyComplete ? 'Completed' : 'Partial',
                    total_amount: grandTotal,
                    items_dispensed: dispByItem.size,
                    items_missing: shortageList.length,
                    total_items_requested: allOrderItems.length,
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

        const activeAdmission = order?.patient_id ? await db.admissions.findFirst({
            where: { patient_id: order.patient_id, status: 'Admitted', organizationId },
            select: { admission_id: true },
        }) : null;

        const isIpdPatient = !!(order?.is_ipd_linked || order?.admission_id || activeAdmission);
        const targetAdmissionId = order?.admission_id || activeAdmission?.admission_id;

        let invoiceId: number | null = null;

        const chargeFailures: string[] = [];
        if (isIpdPatient && targetAdmissionId) {
            // IPD path: post charges to IPD bill
            for (const detail of dispensedDetails) {
                const chargeResult = await postChargeToIpdBill({
                    admission_id: targetAdmissionId,
                    source_module: 'pharmacy',
                    source_ref_id: `PHARM-${orderId}-${detail.medicine_id}`,
                    description: `Pharmacy: ${detail.medicine_name} x${detail.quantity}`,
                    quantity: detail.quantity,
                    unit_price: detail.unit_price,
                    tax_rate: detail.tax_rate,
                    hsn_sac_code: detail.hsn_sac_code,
                    service_category: 'Pharmacy',
                    batch_no: detail.batch_no,
                    expiry_date: detail.expiry_date,
                    mrp: detail.mrp,
                });
                if (!chargeResult?.success) {
                    chargeFailures.push(`${detail.medicine_name}: ${chargeResult?.error || 'failed to post charge'}`);
                    continue;
                }

                // Generate Medication Administration records
                try {
                    let activeMed = await (db as any).activeMedication.findFirst({
                        where: {
                            admission_id: targetAdmissionId,
                            medication_name: { contains: detail.medicine_name, mode: 'insensitive' },
                            status: 'active',
                            organizationId,
                        }
                    });

                    if (!activeMed) {
                        activeMed = await (db as any).activeMedication.create({
                            data: {
                                admission_id: targetAdmissionId,
                                patient_id: order!.patient_id,
                                medication_name: detail.medicine_name,
                                dosage: "1",
                                route: "Oral",
                                frequency: "BD",
                                prescribed_by: "Pharmacy Dispense",
                                status: "active",
                                organizationId,
                            }
                        });
                    }

                    const existingAdmin = await db.medicationAdministration.findFirst({
                        where: {
                            admission_id: targetAdmissionId,
                            medication_name: { contains: detail.medicine_name, mode: 'insensitive' },
                            status: 'Scheduled',
                            organizationId,
                        }
                    });

                    if (!existingAdmin) {
                        await scheduleMedicationAdministrations(db, activeMed, organizationId);
                    }
                } catch (medErr) {
                    console.error("Failed to generate medication administrations from pharmacy dispense:", medErr);
                }
            }
        } else {
            // OPD path: create formal invoice with GST → GL → GST register
            const cgst = totalTax / 2;
            const sgst = totalTax / 2;

            const invoice = await db.invoices.create({
                data: {
                    invoice_number: await generateSequentialNumber(organizationId, 'PHM', db),
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
                        batch_no: detail.batch_no,
                        expiry_date: detail.expiry_date,
                        mrp: detail.mrp,
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

            // Post to GL and GST register (non-blocking — don't await)
            postInvoiceToGL(invoice.id).catch(err =>
                console.error('GL posting failed for pharmacy invoice:', invoice.id, err)
            );
            syncInvoiceToGSTRegister(invoice.id).catch(err =>
                console.error('GST sync failed for pharmacy invoice:', invoice.id, err)
            );
        }

        revalidatePath('/pharmacy/orders');
        revalidatePath('/pharmacy/ip-orders');
        revalidatePath('/pharmacy/billing');
        invalidatePharmacyTags(['stock', 'orders']);

        // Notify the ward when an inpatient indent went out short, naming the exact
        // shortfall so nursing staff can chase a restock or re-indent the balance.
        if (shortageList.length > 0 && (preIsIpdPatient || preOrder.admission_id)) {
            try {
                const patient = await db.oPD_REG.findFirst({
                    where: { patient_id: preOrder.patient_id },
                    select: { full_name: true },
                });
                const ord = await db.pharmacy_orders.findUnique({
                    where: { id: orderId },
                    select: { indent_number: true },
                });
                const ref = ord?.indent_number || `IND-${orderId}`;
                const lines = shortageList
                    .map(s => `${s.medicine_name} ${s.dispensed}/${s.requested} (short ${s.short})`)
                    .join('; ');
                await notifyUsersByRole('nurse', {
                    title: `Pharmacy stock shortage — ${ref}`,
                    body: `Indent ${ref} for ${patient?.full_name || preOrder.patient_id} was dispensed with shortages: ${lines}. Please arrange a restock or re-indent the balance.`,
                    type: 'warning',
                    link: '/pharmacy/ip-orders',
                });
            } catch (notifyErr) {
                console.error('Shortage notification failed:', notifyErr);
            }
        }

        if (chargeFailures.length > 0) {
            // Stock is already deducted and the order is marked Completed at this point —
            // surface this loudly instead of returning success so staff know to reconcile
            // the bill manually, rather than the medicine silently vanishing from the invoice.
            return {
                success: false,
                error: `Stock was dispensed but failed to post to the IPD bill for: ${chargeFailures.join('; ')}. An Admin/Finance user must add these charges manually.`,
                total: grandTotal,
                ipd_posted: false,
            };
        }

        return {
            success: true,
            total: grandTotal,
            subtotal: totalAmount,
            tax: totalTax,
            invoice_id: invoiceId,
            ipd_posted: isIpdPatient && !!targetAdmissionId,
            shortages: shortageList,
            partial: shortageList.length > 0,
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Dispense an IPD indent, supplying whatever is currently in stock and flagging
 * any shortfall. Allocates each line across batches using FEFO (first-expiry-
 * first-out), capped at the quantity available, then hands the built payload to
 * dispenseMedicine — which records the partial line status, marks the order
 * 'Partial', and notifies nursing staff of the exact shortage.
 */
export async function dispenseIndentWithShortages(orderId: number) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();

        const order = await db.pharmacy_orders.findUnique({
            where: { id: orderId },
            include: { items: true },
        });
        if (!order) return { success: false, error: 'Order not found' };

        const dispensedItems: any[] = [];
        let anyRequested = false;

        for (const item of order.items) {
            // Skip lines already fully dispensed on a previous action.
            if (item.status === 'Dispensed') continue;
            const requested = item.quantity_requested ?? 0;
            if (requested <= 0) continue;
            anyRequested = true;
            if (!item.medicine_id) continue; // unresolved medicine -> reported as fully short

            const batches = await db.pharmacy_batch_inventory.findMany({
                where: dispensableBatchWhere(item.medicine_id),
                orderBy: { expiry_date: 'asc' },
            });

            let need = requested;
            for (const b of batches) {
                if (need <= 0) break;
                const take = Math.min(need, b.current_stock);
                if (take <= 0) continue;
                dispensedItems.push({
                    order_item_id: item.id,
                    medicine_id: item.medicine_id,
                    medicine_name: item.medicine_name,
                    batch_no: b.batch_no,
                    quantity: take,
                });
                need -= take;
            }
        }

        if (!anyRequested) return { success: false, error: 'Nothing left to dispense on this indent.' };
        if (dispensedItems.length === 0) {
            return { success: false, error: 'No stock available for any item on this indent.' };
        }

        return await dispenseMedicine(orderId, dispensedItems);
    } catch (error: any) {
        console.error('dispenseIndentWithShortages error:', error);
        return { success: false, error: error?.message || 'Failed to dispense indent' };
    }
}

/**
 * Manual dispense for the Nursing Indent page. The pharmacist explicitly enters
 * the quantity to dispense per line (including overriding zero-system-stock items).
 *
 * Strategy for overrides (Option A):
 *  - Deduct from batch stock up to what is available (FEFO).
 *  - Any qty the pharmacist says to dispense beyond batch stock is treated as
 *    "physically dispensed, not in system" — the patient is charged for the full
 *    qty but no batch deduction is attempted for the overage. A note is recorded
 *    on the order item so it can be reconciled during stock audit.
 *  - Lines where qty_to_dispense === 0 are skipped (stay Pending).
 */
export async function dispenseIndentManual(
    orderId: number,
    lines: { order_item_id: number; qty_to_dispense: number }[]
) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();

        // Validate order exists and is dispensable
        const order = await db.pharmacy_orders.findUnique({
            where: { id: orderId },
            include: { items: true },
        });
        if (!order) return { success: false, error: 'Order not found' };
        if (!['Verified', 'Dispensing', 'Partial'].includes(order.status)) {
            return { success: false, error: `Cannot dispense an order with status "${order.status}"` };
        }

        // Gate on IPD bill status (same as dispenseMedicine)
        const preActiveAdmission = order.patient_id ? await db.admissions.findFirst({
            where: { patient_id: order.patient_id, status: 'Admitted', organizationId },
            select: { admission_id: true },
        }) : null;
        const targetAdmissionId = order.admission_id || preActiveAdmission?.admission_id;
        const isIpdPatient = !!(order.is_ipd_linked || order.admission_id || preActiveAdmission);

        if (isIpdPatient && targetAdmissionId) {
            const admRec = await db.admissions.findUnique({
                where: { admission_id: targetAdmissionId },
                select: { status: true },
            });
            if (admRec?.status === 'Discharged') {
                return { success: false, error: BILL_FINALIZED_INTENT_MSG };
            }
            const activeInvoice = await db.invoices.findFirst({
                where: { admission_id: targetAdmissionId, status: { not: 'Cancelled' } },
                select: { status: true, is_locked: true },
            });
            if (isBillClosedForCharges(activeInvoice)) {
                return { success: false, error: BILL_FINALIZED_INTENT_MSG };
            }
        }

        // Build per-item maps for quick lookup
        const itemMap = new Map(order.items.map((i: any) => [i.id, i]));

        // Filter to only lines the pharmacist wants to dispense (qty > 0)
        const activeLines = lines.filter(l => l.qty_to_dispense > 0);
        if (activeLines.length === 0) {
            return { success: false, error: 'No items selected for dispensing. Please enter a quantity for at least one item.' };
        }

        // For each active line, resolve batch allocations (FEFO) and detect overrides
        const dispensedItems: any[] = [];   // goes into dispenseMedicine for stock-backed qty
        const overrideItems: any[] = [];    // qty beyond system stock — manual override

        for (const line of activeLines) {
            const orderItem = itemMap.get(line.order_item_id) as any;
            if (!orderItem) continue;
            if (!orderItem.medicine_id) {
                // Unresolved medicine — treat entire qty as override
                overrideItems.push({
                    order_item_id: line.order_item_id,
                    medicine_name: orderItem.medicine_name,
                    qty_override: line.qty_to_dispense,
                });
                continue;
            }

            const batches = await db.pharmacy_batch_inventory.findMany({
                where: dispensableBatchWhere(orderItem.medicine_id),
                orderBy: { expiry_date: 'asc' },
            });

            let remaining = line.qty_to_dispense;

            // Allocate from batches FEFO
            for (const b of batches) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, b.current_stock);
                if (take <= 0) continue;
                dispensedItems.push({
                    order_item_id: line.order_item_id,
                    medicine_id: orderItem.medicine_id,
                    medicine_name: orderItem.medicine_name,
                    batch_no: b.batch_no,
                    quantity: take,
                });
                remaining -= take;
            }

            // Any qty beyond available batch stock → manual override
            if (remaining > 0) {
                overrideItems.push({
                    order_item_id: line.order_item_id,
                    medicine_id: orderItem.medicine_id,
                    medicine_name: orderItem.medicine_name,
                    qty_override: remaining,
                });
            }
        }

        // --- Process stock-backed dispensing via the existing dispenseMedicine path ---
        let dispenseResult: any = { success: true, shortages: [], total: 0 };
        if (dispensedItems.length > 0) {
            dispenseResult = await dispenseMedicine(orderId, dispensedItems);
            if (!dispenseResult.success) return dispenseResult;
        }

        // --- Process manual overrides (no batch stock) ---
        // For each override: charge the patient for the quantity, record a note,
        // update the order item status. No inventory movement (physical stock
        // reconciliation is done by the pharmacist separately).
        const overrideShortages: { medicine_name: string; requested: number; dispensed: number }[] = [];

        if (overrideItems.length > 0) {
            for (const ov of overrideItems) {
                const orderItem = itemMap.get(ov.order_item_id) as any;
                const requested = orderItem?.quantity_requested ?? ov.qty_override;

                // Get medicine price for billing
                let unitPrice = 0;
                if (ov.medicine_id) {
                    const med = await db.pharmacy_medicine_master.findUnique({ where: { id: ov.medicine_id } });
                    unitPrice = Number(med?.selling_price || med?.price_per_unit || 0);
                }
                const totalCharge = unitPrice * ov.qty_override;
                const taxRate = 0; // no batch → use 0, reconcile later

                // Mark order item as dispensed (or partial if override qty < requested)
                const alreadyDispensed = dispensedItems
                    .filter(d => d.order_item_id === ov.order_item_id)
                    .reduce((sum: number, d: any) => sum + d.quantity, 0);
                const totalDispensed = alreadyDispensed + ov.qty_override;

                await db.pharmacy_order_items.update({
                    where: { id: ov.order_item_id },
                    data: {
                        quantity_dispensed: totalDispensed,
                        unit_price: unitPrice,
                        total_price: totalCharge,
                        status: totalDispensed >= requested ? 'Dispensed' : 'Partial',
                    },
                });

                // Post charge to IPD bill for the override qty
                if (isIpdPatient && targetAdmissionId && unitPrice > 0) {
                    const chargeResult = await postChargeToIpdBill({
                        admission_id: targetAdmissionId,
                        source_module: 'pharmacy',
                        source_ref_id: `PHARM-${orderId}-OVR-${ov.order_item_id}`,
                        description: `Pharmacy (Manual Override): ${ov.medicine_name} x${ov.qty_override}`,
                        quantity: ov.qty_override,
                        unit_price: unitPrice,
                        tax_rate: taxRate,
                        hsn_sac_code: '3004',
                        service_category: 'Pharmacy',
                    });
                    if (!chargeResult?.success) {
                        console.error(`Override charge failed for ${ov.medicine_name}:`, chargeResult?.error);
                    }
                }

                if (totalDispensed < requested) {
                    overrideShortages.push({ medicine_name: ov.medicine_name, requested, dispensed: totalDispensed });
                }
            }

            // Re-evaluate order status after overrides
            const allItems = await db.pharmacy_order_items.findMany({ where: { order_id: orderId } });
            const skippedIds = new Set(
                lines.filter(l => l.qty_to_dispense === 0).map(l => l.order_item_id)
            );
            const relevantItems = allItems.filter((i: any) => !skippedIds.has(i.id));
            const allDone = relevantItems.every((i: any) => i.status === 'Dispensed');
            await db.pharmacy_orders.update({
                where: { id: orderId },
                data: { status: allDone ? 'Completed' : 'Partial' },
            });
        }

        // --- Handle lines pharmacist intentionally skipped (qty = 0) ---
        // These stay 'Pending' — no status change needed. The order stays Partial.
        const skippedLines = lines.filter(l => l.qty_to_dispense === 0);
        if (skippedLines.length > 0) {
            // Ensure order is at least 'Partial' if there are still pending lines
            const currentOrder = await db.pharmacy_orders.findUnique({ where: { id: orderId }, select: { status: true } });
            if (currentOrder?.status === 'Completed') {
                await db.pharmacy_orders.update({ where: { id: orderId }, data: { status: 'Partial' } });
            }
        }

        revalidatePath('/pharmacy/orders');
        revalidatePath('/pharmacy/ip-orders');
        revalidatePath('/pharmacy/billing');
        invalidatePharmacyTags(['stock', 'orders']);

        const allShortages = [
            ...(dispenseResult.shortages || []),
            ...overrideShortages,
        ];

        // Notify nursing if there are still shortages after the manual dispense
        if (allShortages.length > 0 && (isIpdPatient || order.admission_id)) {
            try {
                const patient = await db.oPD_REG.findFirst({
                    where: { patient_id: order.patient_id },
                    select: { full_name: true },
                });
                const ref = order.indent_number || `IND-${orderId}`;
                const lines_summary = allShortages
                    .map((s: any) => `${s.medicine_name} ${s.dispensed}/${s.requested} (short ${s.requested - s.dispensed})`)
                    .join('; ');
                await notifyUsersByRole('nurse', {
                    title: `Pharmacy shortage — ${ref}`,
                    body: `Indent ${ref} for ${patient?.full_name || order.patient_id} was dispensed with shortages: ${lines_summary}.`,
                    type: 'warning',
                    link: '/pharmacy/ip-orders',
                });
            } catch (notifyErr) {
                console.error('Shortage notification failed:', notifyErr);
            }
        }

        const overrideCount = overrideItems.length;
        const skippedCount = skippedLines.length;

        return {
            success: true,
            total: dispenseResult.total || 0,
            shortages: allShortages,
            partial: allShortages.length > 0 || skippedCount > 0,
            overrides: overrideCount,
            skipped: skippedCount,
        };
    } catch (error: any) {
        console.error('dispenseIndentManual error:', error);
        return { success: false, error: error?.message || 'Failed to dispense indent' };
    }
}

export async function searchMedicine(
    queryOrOpts?: string | {
        query?: string;
        limit?: number;
        cursor?: number;
        activeOnly?: boolean;
        includeBatches?: boolean;
        includeEmptyBatches?: boolean;
    }
) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_CATALOG_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();

        const opts = typeof queryOrOpts === 'string'
            ? { query: queryOrOpts }
            : (queryOrOpts ?? {});
        const query = (opts.query ?? '').trim();
        const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
        const activeOnly = opts.activeOnly ?? true;
        const includeBatches = (opts as any).includeBatches ?? false;
        // Returns/restocking may target a depleted batch (stock 0), so callers can
        // opt to include zero-stock batches too.
        const includeEmptyBatches = (opts as any).includeEmptyBatches ?? false;

        const where: any = {};
        if (activeOnly) where.is_active = true;
        if (query) {
            const words = query.split(/\s+/).filter(Boolean);
            if (words.length > 0) {
                where.AND = words.map(word => ({
                    OR: [
                        { brand_name: { contains: word, mode: 'insensitive' } },
                        { generic_name: { contains: word, mode: 'insensitive' } },
                    ]
                }));
            }
        }
        if (opts.cursor) where.id = { gt: opts.cursor };

        const baseSelect = {
            id: true,
            brand_name: true,
            generic_name: true,
            strength: true,
            form: true,
            category: true,
            mrp: true,
            selling_price: true,
            price_per_unit: true,
            gst_percent: true,
            tax_rate: true,
            hsn_sac_code: true,
            min_threshold: true,
            is_active: true,
        };

        const meds = await db.pharmacy_medicine_master.findMany({
            where,
            orderBy: { brand_name: 'asc' },
            take: limit,
            ...(includeBatches
                ? {
                    include: {
                        batches: {
                            where: includeEmptyBatches ? {} : { current_stock: { gt: 0 } },
                            orderBy: { expiry_date: 'asc' },
                            select: {
                                id: true,
                                batch_no: true,
                                current_stock: true,
                                expiry_date: true,
                                mrp: true,
                                cost_price: true,
                                rack_location: true,
                            },
                        },
                    },
                }
                : { select: baseSelect }),
        });

        const nextCursor = meds.length === limit ? meds[meds.length - 1].id : undefined;
        return { success: true, data: meds, nextCursor };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function getLowStockAlerts() {
    const denied = await denyUnlessPharmacyRole(PHARMACY_CATALOG_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();
        // Raw queries bypass the tenant $extends middleware — bind organizationId explicitly.
        const rows = await db.$queryRaw<Array<{
            id: number;
            brand_name: string;
            generic_name: string | null;
            category: string | null;
            min_threshold: number;
            total_stock: number;
        }>>`
            SELECT m.id,
                   m.brand_name,
                   m.generic_name,
                   m.category,
                   m.min_threshold,
                   COALESCE(SUM(b.current_stock), 0)::int AS total_stock
            FROM "pharmacy_medicine_master" m
            LEFT JOIN "pharmacy_batch_inventory" b ON b.medicine_id = m.id
            WHERE m."organizationId" = ${organizationId}
              AND m.is_active = true
            GROUP BY m.id
            HAVING COALESCE(SUM(b.current_stock), 0) <= m.min_threshold
            ORDER BY total_stock ASC, m.brand_name ASC
            LIMIT 200
        `;
        return { success: true, data: rows };
    } catch (error) {
        return { success: false, data: [] };
    }
}

export async function getExpiringBatches(days: number = 30) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_CATALOG_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        const batches = await db.pharmacy_batch_inventory.findMany({
            where: {
                // pharmacy_batch_inventory has no organizationId column, so it is
                // absent from TENANT_SCOPED_MODELS and the $extends auto-scoping
                // never applied here — this query was returning every tenant's
                // batches. Scope through the parent medicine explicitly.
                medicine: { organizationId },
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
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

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
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

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
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

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
    items: {
        medicine_id: number,
        quantity: number,
        unit_price: number,
        gst_rate?: number,
        hsn_code?: string,
        pack?: string,
        batch_no?: string,
        expiry?: string,
        mrp?: number,
        discount_pct?: number,
        cgst_rate?: number,
        sgst_rate?: number,
    }[],
    options?: { vendor_id?: number; notes?: string; submit?: boolean }
) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();

        // Per-line amount is GST auto-calculated from rate, qty, discount and CGST/SGST:
        //   taxable = qty * rate * (1 - discount/100)
        //   gst     = taxable * (cgst% + sgst%) / 100
        //   amount  = taxable + gst   (GST-inclusive line total, like a supplier invoice)
        // Each line is rounded to 2dp BEFORE summing so the PO total matches the
        // purchase invoice total exactly (the invoice rounds per line the same way).
        const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
        const computed = items.map(item => {
            const qty = Number(item.quantity) || 0;
            const rate = Number(item.unit_price) || 0;
            const discount = Number(item.discount_pct) || 0;
            // Prefer explicit CGST/SGST split; fall back to a flat gst_rate (split in half).
            const flat = Number(item.gst_rate) || 0;
            const cgst = item.cgst_rate != null ? Number(item.cgst_rate) : flat / 2;
            const sgst = item.sgst_rate != null ? Number(item.sgst_rate) : flat / 2;
            const totalGstRate = cgst + sgst;

            const taxable = r2(qty * rate * (1 - discount / 100));
            const gst = r2(taxable * totalGstRate / 100);
            const amount = r2(taxable + gst);
            return { item, qty, rate, discount, cgst, sgst, totalGstRate, taxable, gst, amount };
        });

        const totalAmount = r2(computed.reduce((sum, c) => sum + c.amount, 0));
        const gstAmount = r2(computed.reduce((sum, c) => sum + c.gst, 0));
        const poNumber = `PO-${Date.now().toString().slice(-6)}`;

        // supplier_id from UI is actually a Vendor.id (unified vendor table).
        // PurchaseOrder.supplier_id expects a PharmacySupplier.id.
        // Find or create a PharmacySupplier that proxies this vendor.
        const vendorId = supplier_id; // the UI always passes Vendor.id
        const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
        if (!vendor) return { success: false, error: `Supplier not found (id=${vendorId})` };

        let pharmSupplier = await db.pharmacySupplier.findFirst({
            where: { organizationId, name: vendor.vendor_name },
        });
        if (!pharmSupplier) {
            pharmSupplier = await db.pharmacySupplier.create({
                data: {
                    name: vendor.vendor_name,
                    contact_person: vendor.contact_person || null,
                    phone: vendor.phone || null,
                    email: vendor.email || null,
                    gst_no: vendor.gst_number || null,
                    organizationId,
                },
            });
        }
        const resolvedSupplierId = pharmSupplier.id;

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
                supplier_id: resolvedSupplierId,
                vendor_id: vendorId,
                status,
                total_amount: totalAmount,
                gst_amount: gstAmount,
                approved_at: status === 'Approved' ? new Date() : null,
                approved_by: status === 'Approved' ? 'AUTO' : null,
                notes: options?.notes || null,
                organizationId,
                items: {
                    create: computed.map(c => ({
                        medicine_id: c.item.medicine_id,
                        quantity_ordered: c.qty,
                        unit_price: c.rate,
                        gst_rate: c.totalGstRate,
                        hsn_code: c.item.hsn_code || null,
                        pack: c.item.pack || null,
                        batch_no: c.item.batch_no || null,
                        expiry: c.item.expiry || null,
                        mrp: c.item.mrp != null ? Number(c.item.mrp) : 0,
                        discount_pct: c.discount,
                        cgst_rate: c.cgst,
                        sgst_rate: c.sgst,
                        amount: c.amount,
                        quantity_received: 0
                    }))
                }
            }
        });

        revalidatePath('/pharmacy/purchase-orders');
        return { success: true, data: po };
    } catch (error: any) {
        console.error('createPurchaseOrder error:', error.message);
        return { success: false, error: error.message || 'Failed to create PO' };
    }
}

// Quick-create a medicine so it can be added to a Purchase Order even when it
// is not yet in the master catalogue. Unlike the admin-only createMedicine in
// medicine-master-actions, this is available to any pharmacy user. If a brand
// with the same name already exists in the tenant it is reused (the master has
// a @@unique([brand_name, organizationId]) constraint).
export async function quickCreateMedicineForPO(input: {
    brand_name: string;
    generic_name?: string;
    hsn_sac_code?: string;
    gst_percent?: number;
    mrp?: number;
    purchase_price?: number;
    selling_price?: number;
}) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();
        const brand = (input.brand_name || '').trim();
        if (!brand) return { success: false, error: 'Medicine name is required' };

        // Reuse an existing brand (case-insensitive) instead of failing the unique constraint.
        const existing = await db.pharmacy_medicine_master.findFirst({
            where: { brand_name: { equals: brand, mode: 'insensitive' } },
        });
        if (existing) {
            return { success: true, data: existing, reused: true };
        }

        const gst = Number(input.gst_percent) || 0;
        const sell = Number(input.selling_price ?? input.mrp ?? 0) || 0;
        const row = await db.pharmacy_medicine_master.create({
            data: {
                brand_name: brand,
                generic_name: input.generic_name?.trim() || null,
                hsn_sac_code: input.hsn_sac_code?.trim() || null,
                gst_percent: gst,
                tax_rate: gst,
                mrp: Number(input.mrp) || 0,
                purchase_price: Number(input.purchase_price) || 0,
                selling_price: sell,
                price_per_unit: sell,
                organizationId,
            },
        });
        return { success: true, data: row, reused: false };
    } catch (error: any) {
        console.error('quickCreateMedicineForPO error:', error.message);
        return { success: false, error: error.message || 'Failed to create medicine' };
    }
}

// Full edit of an existing Purchase Order: supplier, notes and every line.
// Blocked once any stock has been received (quantity_received > 0 or a
// Received / Partially Received status) since editing then would desync
// inventory. Lines are recomputed and rounded exactly like createPurchaseOrder
// so the PO total still matches the purchase invoice total.
export async function updatePurchaseOrder(
    poId: number,
    supplier_id: number,
    items: {
        medicine_id: number,
        quantity: number,
        unit_price: number,
        gst_rate?: number,
        hsn_code?: string,
        pack?: string,
        batch_no?: string,
        expiry?: string,
        mrp?: number,
        discount_pct?: number,
        cgst_rate?: number,
        sgst_rate?: number,
    }[],
    options?: { vendor_id?: number; notes?: string }
) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();

        const existing = await db.purchaseOrder.findFirst({
            where: { id: poId, organizationId },
            include: { items: true },
        });
        if (!existing) return { success: false, error: 'Purchase order not found' };

        if (['Received', 'Partially Received'].includes(existing.status) ||
            existing.items.some((i: any) => Number(i.quantity_received) > 0)) {
            return { success: false, error: 'Cannot edit a PO once stock has been received' };
        }

        if (!items || items.length === 0) {
            return { success: false, error: 'At least one item is required' };
        }

        const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
        const computed = items.map(item => {
            const qty = Number(item.quantity) || 0;
            const rate = Number(item.unit_price) || 0;
            const discount = Number(item.discount_pct) || 0;
            const flat = Number(item.gst_rate) || 0;
            const cgst = item.cgst_rate != null ? Number(item.cgst_rate) : flat / 2;
            const sgst = item.sgst_rate != null ? Number(item.sgst_rate) : flat / 2;
            const totalGstRate = cgst + sgst;

            const taxable = r2(qty * rate * (1 - discount / 100));
            const gst = r2(taxable * totalGstRate / 100);
            const amount = r2(taxable + gst);
            return { item, qty, rate, discount, cgst, sgst, totalGstRate, taxable, gst, amount };
        });

        const totalAmount = r2(computed.reduce((sum, c) => sum + c.amount, 0));
        const gstAmount = r2(computed.reduce((sum, c) => sum + c.gst, 0));

        // supplier_id from UI is a Vendor.id; resolve to a PharmacySupplier.id.
        const vendorId = supplier_id;
        const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
        if (!vendor) return { success: false, error: `Supplier not found (id=${vendorId})` };

        let pharmSupplier = await db.pharmacySupplier.findFirst({
            where: { organizationId, name: vendor.vendor_name },
        });
        if (!pharmSupplier) {
            pharmSupplier = await db.pharmacySupplier.create({
                data: {
                    name: vendor.vendor_name,
                    contact_person: vendor.contact_person || null,
                    phone: vendor.phone || null,
                    email: vendor.email || null,
                    gst_no: vendor.gst_number || null,
                    organizationId,
                },
            });
        }
        const resolvedSupplierId = pharmSupplier.id;

        const updated = await db.$transaction(async (tx: any) => {
            await tx.purchaseOrderItem.deleteMany({ where: { po_id: poId } });
            return tx.purchaseOrder.update({
                where: { id: poId },
                data: {
                    supplier_id: resolvedSupplierId,
                    vendor_id: vendorId,
                    total_amount: totalAmount,
                    gst_amount: gstAmount,
                    notes: options?.notes ?? existing.notes,
                    items: {
                        create: computed.map(c => ({
                            medicine_id: c.item.medicine_id,
                            quantity_ordered: c.qty,
                            unit_price: c.rate,
                            gst_rate: c.totalGstRate,
                            hsn_code: c.item.hsn_code || null,
                            pack: c.item.pack || null,
                            batch_no: c.item.batch_no || null,
                            expiry: c.item.expiry || null,
                            mrp: c.item.mrp != null ? Number(c.item.mrp) : 0,
                            discount_pct: c.discount,
                            cgst_rate: c.cgst,
                            sgst_rate: c.sgst,
                            amount: c.amount,
                            quantity_received: 0,
                        })),
                    },
                },
            });
        });

        revalidatePath('/pharmacy/purchase-orders');
        return { success: true, data: updated };
    } catch (error: any) {
        console.error('updatePurchaseOrder error:', error.message);
        return { success: false, error: error.message || 'Failed to update PO' };
    }
}

export async function submitPurchaseOrder(poId: number) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

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
    const denied = await denyUnlessPharmacyRole(PHARMACY_PO_APPROVE_ROLES);
    if (denied) return denied;

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
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

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
        invalidatePharmacyTags(['stock']);
        return { success: true, grn_number: grnNumber };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to receive PO' };
    }
}

export async function getPurchaseOrders() {
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();
        const pos = await db.purchaseOrder.findMany({
            orderBy: { created_at: 'desc' },
            include: {
                supplier: true,
                vendor: { select: { id: true, vendor_name: true, vendor_code: true, gst_number: true } },
                items: { include: { medicine: true } },
                grns: { select: { id: true, grn_number: true, received_at: true } },
            },
            take: 200,
        });
        return { success: true, data: pos };
    } catch (error: any) {
        // Surface the real reason instead of silently returning an empty list —
        // an empty array here is indistinguishable from "no POs exist" in the UI
        // and hides genuine failures (e.g. schema drift, DB errors).
        console.error('getPurchaseOrders error:', error?.message || error);
        return { success: false, data: [], error: error?.message || 'Failed to load purchase orders' };
    }
}

export async function processReturn(data: {
    return_type: string,  // patient_return, supplier_return, expired_stock, damage_writeoff
    medicine_id: number,
    batch_id?: string,
    quantity: number,
    reason: string,
    invoice_id?: number,    // original sale invoice for patient returns
    bill_date?: string | Date, // for IPD: the specific dispensing bill/day to deduct from
    vendor_id?: number,     // for supplier returns
    po_id?: number,         // for supplier returns
    purchase_invoice_id?: number, // for supplier returns
}) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_RETURN_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId, session } = await requireTenantContext();

        let creditNoteId: number | null = null;
        let refundAmount = 0;

        await db.$transaction(async (tx: any) => {
            const medicine = await tx.pharmacy_medicine_master.findUnique({
                where: { id: data.medicine_id }
            });
            const taxRate = Number(medicine?.gst_percent) || Number(medicine?.tax_rate) || 0;

            // Find the batch record
            let batchRecord: any = null;
            if (data.batch_id) {
                batchRecord = await tx.pharmacy_batch_inventory.findFirst({
                    where: { batch_no: data.batch_id, medicine_id: data.medicine_id }
                });
            }
            const unitPrice = Number(batchRecord?.mrp) || Number(medicine?.mrp) || Number(medicine?.selling_price) || Number(medicine?.price_per_unit) || 0;
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

        // Patient return: reduce the linked bill.
        // - IPD bill  → add a negative pharmacy line item to the IPD invoice and
        //               drop net_amount/balance_due by the return value (no credit note).
        // - Counter   → create a credit note (existing behaviour) and reduce the invoice.
        if (data.invoice_id && (data.return_type === 'Patient' || data.return_type === 'patient_return') && refundAmount > 0) {
            const medicine = await db.pharmacy_medicine_master.findUnique({ where: { id: data.medicine_id } });
            const invoice = await db.invoices.findUnique({ where: { id: data.invoice_id } });

            if (invoice && invoice.invoice_type === 'IPD') {
                // IPD: deduct directly from the IPD bill via a negative line item.
                // Stamp it with the chosen bill's date so it lands on that day's
                // pharmacy group in the discharge/master bill (returns reduce the
                // exact day they were dispensed, not "today").
                const returnLineDate = data.bill_date ? new Date(data.bill_date) : null;
                await db.invoice_items.create({
                    data: {
                        invoice_id: data.invoice_id,
                        department: 'Pharmacy',
                        service_category: 'Pharmacy',
                        description: `Return: ${medicine?.brand_name || 'Medicine'} x${data.quantity}`,
                        quantity: data.quantity,
                        unit_price: 0,
                        total_price: 0,
                        discount: 0,
                        net_price: -refundAmount,
                        tax_rate: 0,
                        tax_amount: 0,
                        organizationId,
                        ...(returnLineDate ? { created_at: returnLineDate } : {}),
                    }
                });

                const newNetAmount = Math.max(0, Number(invoice.net_amount) - refundAmount);
                const newBalanceDue = Math.max(0, Number(invoice.balance_due) - refundAmount);
                await db.invoices.update({
                    where: { id: data.invoice_id },
                    data: {
                        net_amount: newNetAmount,
                        balance_due: newBalanceDue,
                    }
                });
            } else if (invoice) {
                // Counter / non-IPD pharmacy invoice: existing credit-note behaviour.
                const { createCreditNote } = await import('@/app/actions/deposit-actions');

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

// Resolve the invoice a patient return should be applied to.
// - If the patient is currently admitted, return their active IPD invoice
//   (return value will be deducted directly from the IPD bill).
// - Otherwise return their most recent non-cancelled counter pharmacy invoice
//   (a credit note will be created against it).
// - If neither exists, returns data: null (stock is restocked only).
export async function getReturnInvoiceForPatient(patientId: string) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_RETURN_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();

        const admission = await db.admissions.findFirst({
            where: { patient_id: patientId, status: 'Admitted' },
        });

        if (admission) {
            const invoice = await db.invoices.findFirst({
                where: { admission_id: admission.admission_id, status: { not: 'Cancelled' } },
                orderBy: { created_at: 'desc' },
            });
            if (invoice) {
                const patient = await db.oPD_REG.findUnique({
                    where: { patient_id: patientId },
                    select: { full_name: true },
                });
                return {
                    success: true,
                    data: {
                        invoice_id: invoice.id,
                        invoice_number: invoice.invoice_number,
                        invoice_type: invoice.invoice_type,
                        is_ipd: true,
                        patient_name: patient?.full_name ?? null,
                        net_amount: Number(invoice.net_amount),
                        balance_due: Number(invoice.balance_due),
                    },
                };
            }
        }

        const invoice = await db.invoices.findFirst({
            where: {
                patient_id: patientId,
                invoice_type: { in: ['PHARMACY', 'Pharmacy'] },
                status: { not: 'Cancelled' },
            },
            orderBy: { created_at: 'desc' },
        });

        if (invoice) {
            return {
                success: true,
                data: {
                    invoice_id: invoice.id,
                    invoice_number: invoice.invoice_number,
                    invoice_type: invoice.invoice_type,
                    is_ipd: false,
                    patient_name: null,
                    net_amount: Number(invoice.net_amount),
                    balance_due: Number(invoice.balance_due),
                },
            };
        }

        return { success: true, data: null };
    } catch (error: any) {
        console.error('getReturnInvoiceForPatient error:', error);
        return { success: false, error: error.message || 'Failed to resolve return invoice' };
    }
}

// Search returnable bills for the pharmacy Returns screen. Matches pharmacy
// counter bills (incl. walk-in/OTC whose customer name lives in `notes`) and IPD
// bills, by invoice number, registered patient name/phone/ID, or walk-in name.
export async function searchReturnableInvoices(query: string) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();
        const q = (query || '').trim();
        if (q.length < 2) return { success: true, data: [] };

        const invoices = await db.invoices.findMany({
            where: {
                status: { not: 'Cancelled' },
                invoice_type: { in: ['Pharmacy', 'PHARMACY', 'IPD'] },
                OR: [
                    { invoice_number: { contains: q, mode: 'insensitive' } },
                    { notes: { contains: q, mode: 'insensitive' } },        // walk-in / OTC name
                    { patient_id: { contains: q, mode: 'insensitive' } },
                    { patient: { full_name: { contains: q, mode: 'insensitive' } } },
                    { patient: { phone: { contains: q } } },
                ],
            },
            include: {
                patient: { select: { full_name: true } },
                // For IPD bills, pull the pharmacy lines so we can split the invoice
                // into individual dispensing bills the user can return against.
                items: { where: { service_category: 'Pharmacy' }, select: { created_at: true, net_price: true, tax_amount: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 15,
        });

        const data: any[] = [];
        for (const inv of invoices) {
            const isWalkin = inv.patient_id === 'WALKIN';
            const name = isWalkin
                ? (parseWalkinNote(inv.notes).name || 'Walk-in / OTC')
                : (inv.patient?.full_name || inv.patient_id);

            if (inv.invoice_type === 'IPD') {
                // One entry per pharmacy bill (dispensing event) so the user picks the
                // specific bill/day; the return is then deducted from that day.
                const pharmItems: any[] = inv.items || [];
                const billMap = new Map<string, any[]>();
                for (const it of pharmItems) {
                    const key = dispensingKey(it.created_at);
                    if (!billMap.has(key)) billMap.set(key, []);
                    billMap.get(key)!.push(it);
                }
                const bills = Array.from(billMap.values())
                    .map((items) => ({
                        billDate: new Date(Math.max(...items.map((it: any) => new Date(it.created_at).getTime()))),
                        gross: items.reduce((s: number, it: any) => s + Number(it.net_price || 0) + Number(it.tax_amount || 0), 0),
                    }))
                    .sort((a, b) => b.billDate.getTime() - a.billDate.getTime());

                if (bills.length === 0) {
                    // IPD bill with no pharmacy lines yet — keep a single entry.
                    data.push({
                        invoice_id: inv.id, invoice_number: inv.invoice_number, patient_name: name,
                        is_ipd: true, is_walkin: false, invoice_type: 'IPD',
                        created_at: inv.created_at, bill_date: null,
                        net_amount: Number(inv.net_amount), balance_due: Number(inv.balance_due),
                    });
                } else {
                    for (const b of bills) {
                        data.push({
                            invoice_id: inv.id, invoice_number: inv.invoice_number, patient_name: name,
                            is_ipd: true, is_walkin: false, invoice_type: 'IPD',
                            created_at: b.billDate, bill_date: b.billDate,
                            net_amount: b.gross, balance_due: Number(inv.balance_due),
                        });
                    }
                }
            } else {
                data.push({
                    invoice_id: inv.id,
                    invoice_number: inv.invoice_number,
                    patient_name: name,
                    is_ipd: false,
                    is_walkin: isWalkin,
                    invoice_type: inv.invoice_type,
                    created_at: inv.created_at,
                    bill_date: null,
                    net_amount: Number(inv.net_amount),
                    balance_due: Number(inv.balance_due),
                });
            }
        }
        return { success: true, data };
    } catch (error: any) {
        console.error('searchReturnableInvoices error:', error);
        return { success: false, error: error.message || 'Search failed', data: [] };
    }
}


export async function getPharmacyOrderDetails(orderId: number) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

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
            // Only dispensable batches reach the screen — the batch dropdown and
            // its FEFO default are built straight off this list, so offering an
            // expired batch here is what put one in front of the pharmacist.
            include: {
                batches: {
                    where: { current_stock: { gt: 0 }, is_quarantined: false, expiry_date: { gt: new Date() } },
                    orderBy: { expiry_date: 'asc' },
                },
            },
        });

        const itemsWithStock = order.items.map((item: any) => {
            const med = medicines.find((m: any) => m.brand_name === item.medicine_name);
            const batches = med?.batches || [];
            const totalStock = batches.reduce((sum: number, b: any) => sum + b.current_stock, 0);
            return {
                ...item,
                available_batches: batches.map((b: any) => ({ id: b.id, batch_no: b.batch_no, stock: b.current_stock, expiry: b.expiry_date })),
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
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

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
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();

        // Default to last 90 days to keep result set manageable
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const entries = await (db.narcoticRegister as any).findMany({
            where: {
                organizationId,
                ...(drugName ? { drug_name: drugName } : {}),
                created_at: { gte: ninetyDaysAgo },
            },
            orderBy: { created_at: 'desc' },
            take: 500,
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
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

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
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

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
    const denied = await denyUnlessPharmacyRole(PHARMACY_CATALOG_ROLES);
    if (denied) return denied;

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
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const exp30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const exp60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

        const [
            stockSummaryRows,
            expirySummaryRows,
            lowStockListRows,
            topMoversRows,
            completedOrders30d,
            completedOrdersToday,
            pendingCount,
            returns30d,
            purchaseOrders30d,
            pharmOutstandingRows,
        ] = await Promise.all([
            // Total stock value + low/out-of-stock counts in one SQL pass.
            db.$queryRaw<Array<{ total_stock_value: number; low_stock_count: bigint; out_of_stock_count: bigint }>>`
                WITH stock AS (
                    SELECT m.id,
                           m.min_threshold,
                           COALESCE(SUM(b.current_stock), 0) AS total_stock,
                           COALESCE(SUM(b.current_stock * COALESCE(NULLIF(m.selling_price, 0), m.price_per_unit, 0)), 0)::float AS stock_value
                    FROM "pharmacy_medicine_master" m
                    LEFT JOIN "pharmacy_batch_inventory" b ON b.medicine_id = m.id
                    WHERE m."organizationId" = ${organizationId} AND m.is_active = true
                    GROUP BY m.id, m.min_threshold, m.selling_price, m.price_per_unit
                )
                SELECT COALESCE(SUM(stock_value), 0)::float AS total_stock_value,
                       COUNT(*) FILTER (WHERE total_stock > 0 AND total_stock <= min_threshold)::bigint AS low_stock_count,
                       COUNT(*) FILTER (WHERE total_stock = 0)::bigint AS out_of_stock_count
                FROM stock
            `,
            // Expiry tier counts + write-off value in one SQL pass.
            db.$queryRaw<Array<{
                expired_count: bigint;
                expiring30_count: bigint;
                expiring60_count: bigint;
                expiring90_count: bigint;
                writeoff_value: number;
            }>>`
                SELECT
                    COUNT(*) FILTER (WHERE b.expiry_date < ${now})::bigint AS expired_count,
                    COUNT(*) FILTER (WHERE b.expiry_date >= ${now} AND b.expiry_date <= ${exp30})::bigint AS expiring30_count,
                    COUNT(*) FILTER (WHERE b.expiry_date > ${exp30} AND b.expiry_date <= ${exp60})::bigint AS expiring60_count,
                    COUNT(*) FILTER (WHERE b.expiry_date > ${exp60} AND b.expiry_date <= ${ninetyDays})::bigint AS expiring90_count,
                    COALESCE(SUM(
                        CASE WHEN b.expiry_date < ${now}
                             THEN b.current_stock * COALESCE(NULLIF(m.selling_price, 0), m.price_per_unit, 0)
                             ELSE 0 END
                    ), 0)::float AS writeoff_value
                FROM "pharmacy_batch_inventory" b
                JOIN "pharmacy_medicine_master" m ON m.id = b.medicine_id
                WHERE m."organizationId" = ${organizationId}
                  AND b.current_stock > 0
            `,
            // Low-stock top-10 list for the dashboard card.
            db.$queryRaw<Array<{ brand_name: string; total_stock: number; min_threshold: number }>>`
                SELECT m.brand_name,
                       COALESCE(SUM(b.current_stock), 0)::int AS total_stock,
                       m.min_threshold
                FROM "pharmacy_medicine_master" m
                LEFT JOIN "pharmacy_batch_inventory" b ON b.medicine_id = m.id
                WHERE m."organizationId" = ${organizationId} AND m.is_active = true
                GROUP BY m.id, m.brand_name, m.min_threshold
                HAVING COALESCE(SUM(b.current_stock), 0) > 0
                   AND COALESCE(SUM(b.current_stock), 0) <= m.min_threshold
                ORDER BY total_stock ASC
                LIMIT 10
            `,
            // Top movers from completed orders in last 30 days (replaces in-memory Map reduce).
            db.$queryRaw<Array<{ name: string; qty: bigint; revenue: number }>>`
                SELECT
                    i.medicine_name AS name,
                    SUM(COALESCE(i.quantity_dispensed, i.quantity_requested, 0))::bigint AS qty,
                    SUM(COALESCE(i.total_price, 0))::float AS revenue
                FROM "pharmacy_order_items" i
                JOIN "pharmacy_orders" o ON o.id = i.order_id
                WHERE o."organizationId" = ${organizationId}
                  AND o.status = 'Completed'
                  AND o.created_at >= ${thirtyDaysAgo}
                GROUP BY i.medicine_name
                ORDER BY qty DESC
                LIMIT 10
            `,
            db.pharmacy_orders.findMany({
                where: { status: 'Completed', created_at: { gte: thirtyDaysAgo } },
                select: { id: true, total_amount: true, created_at: true },
            }),
            db.pharmacy_orders.findMany({
                where: { status: 'Completed', created_at: { gte: today } },
                select: { id: true, total_amount: true },
            }),
            db.pharmacy_orders.count({ where: { status: 'Pending' } }),
            db.pharmacyReturn.findMany({
                where: { created_at: { gte: thirtyDaysAgo } },
                select: { id: true, quantity: true, return_type: true, unit_cost: true },
                take: 500,
            }),
            db.purchaseOrder.findMany({
                where: { created_at: { gte: thirtyDaysAgo }, status: 'Received' },
                select: { id: true, total_amount: true },
                take: 500,
            }),
            // Pharmacy-only outstanding: standalone PHARMACY invoices with balance > 0
            // This intentionally excludes IPD invoices (admission_id IS NOT NULL)
            // so the dashboard shows only meds billed from the pharmacy portal.
            db.$queryRaw<Array<{ outstanding: number; count: bigint }>>`
                SELECT
                    COALESCE(SUM(GREATEST(balance_due::numeric, 0)), 0)::float AS outstanding,
                    COUNT(*)::bigint AS count
                FROM "invoices"
                WHERE "organizationId" = ${organizationId}
                  AND invoice_type IN ('Pharmacy', 'PHARMACY')
                  AND admission_id IS NULL
                  AND status NOT IN ('Cancelled', 'Paid')
                  AND balance_due > 0
            `,
        ]);

        // -- Revenue metrics --
        const todayRevenue = completedOrdersToday.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);
        const revenue30d = completedOrders30d.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);
        const avgDailyRevenue = revenue30d / 30;

        // -- Revenue by day (last 7 days) — derived from completedOrders30d.
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
                date: dayStart.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
                revenue: dayOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0),
                orders: dayOrders.length,
            });
        }

        const stockSummary = (stockSummaryRows as any[])[0] ?? {
            total_stock_value: 0, low_stock_count: BigInt(0), out_of_stock_count: BigInt(0),
        };
        const expirySummary = (expirySummaryRows as any[])[0] ?? {
            expired_count: BigInt(0), expiring30_count: BigInt(0), expiring60_count: BigInt(0),
            expiring90_count: BigInt(0), writeoff_value: 0,
        };

        const topMovers = (topMoversRows as any[]).map((r: any) => ({
            name: r.name,
            qty: Number(r.qty),
            revenue: Number(r.revenue),
        }));

        const lowStockItems = (lowStockListRows as any[]).map((r: any) => ({
            name: r.brand_name,
            stock: Number(r.total_stock),
            threshold: r.min_threshold,
        }));

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
                totalStockValue: Number(stockSummary.total_stock_value) || 0,
                grossMarginPct: Math.round(grossMargin * 10) / 10,

                // Stock health
                lowStockCount: Number(stockSummary.low_stock_count) || 0,
                outOfStockCount: Number(stockSummary.out_of_stock_count) || 0,
                lowStockItems,

                // Expiry tiers
                expiredCount: Number(expirySummary.expired_count) || 0,
                expiring30Count: Number(expirySummary.expiring30_count) || 0,
                expiring60Count: Number(expirySummary.expiring60_count) || 0,
                expiring90Count: Number(expirySummary.expiring90_count) || 0,
                expiryWriteOffValue: Number(expirySummary.writeoff_value) || 0,

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

                // Pharmacy-only outstanding (OPD/standalone pharma invoices only — no IPD)
                pharmacyOutstanding: Number((pharmOutstandingRows as any[])[0]?.outstanding || 0),
                pharmacyOutstandingCount: Number((pharmOutstandingRows as any[])[0]?.count || 0),
            }
        };
    } catch (error) {
        console.error('Analytics Error:', error);
        return { success: false, error: 'Failed to load analytics' };
    }
}

// ============================================
// PHARMACY REVENUE REPORT — IPD / OPD / COUNTER SEGMENTATION
// ============================================
// Authoritative billed-revenue report sourced from the invoices/invoice_items
// tables (NOT pharmacy_orders, which misses direct counter sales and mislabels
// IPD dispenses). Three channels:
//   Counter = invoices invoice_type='Pharmacy' AND patient_id='WALKIN'
//   OPD     = invoices invoice_type='Pharmacy' AND patient_id != 'WALKIN'
//   IPD     = invoice_items service_category='Pharmacy' on invoice_type='IPD' bills

// Strip "Pharmacy: " prefix and "(Batch ...)" suffix to recover the medicine name
function extractMedicineName(desc: string): string {
    const raw = desc || '';
    let s = raw.replace(/^Pharmacy:\s*/i, '');
    s = s.replace(/\s*\(Batch[:\s].*$/i, '');
    s = s.replace(/\s*[×x]\s*\d.*$/i, '');
    return s.trim() || raw;
}

export async function getPharmacyRevenueReport(filters?: {
    from?: string;
    to?: string;
    channel?: 'all' | 'counter' | 'opd' | 'ipd';
    doctor?: string;
    search?: string;
}) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();

        const now = new Date();
        const fromDate = filters?.from
            ? new Date(filters.from.length <= 10 ? filters.from + 'T00:00:00' : filters.from)
            : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const toDate = filters?.to
            ? new Date(filters.to.length <= 10 ? filters.to + 'T23:59:59.999' : filters.to)
            : now;
        const channel = filters?.channel || 'all';
        const doctor = filters?.doctor?.trim();
        const search = filters?.search?.trim().toLowerCase();
        const dateRange = { gte: fromDate, lte: toDate };

        // a. Counter + OPD — standalone Pharmacy invoices
        const pharmacyInvoices = await db.invoices.findMany({
            where: {
                invoice_type: 'Pharmacy',
                status: { not: 'Cancelled' },
                created_at: dateRange,
                ...(doctor ? { doctor_name: doctor } : {}),
            },
            select: {
                id: true, invoice_number: true, patient_id: true, net_amount: true,
                doctor_name: true, notes: true, created_at: true,
                patient: { select: { full_name: true } },
                items: { select: { description: true, quantity: true, net_price: true, tax_amount: true } },
            },
            take: 5000,
        });

        // b. IPD pharmacy — line items off IPD bills
        const ipdItems = await db.invoice_items.findMany({
            where: {
                service_category: 'Pharmacy',
                created_at: dateRange,
                invoice: {
                    invoice_type: 'IPD',
                    status: { not: 'Cancelled' },
                    ...(doctor ? { doctor_name: doctor } : {}),
                },
            },
            select: {
                description: true, quantity: true, net_price: true, tax_amount: true, created_at: true,
                invoice: {
                    select: {
                        id: true, invoice_number: true, patient_id: true, doctor_name: true,
                        patient: { select: { full_name: true } },
                    },
                },
            },
            take: 10000,
        });

        // -- Aggregation accumulators --
        const channels = {
            counter: { revenue: 0, billCount: 0, itemCount: 0 },
            opd: { revenue: 0, billCount: 0, itemCount: 0 },
            ipd: { revenue: 0, billCount: 0, itemCount: 0 },
        };
        const dayMap = new Map<string, { counter: number; opd: number; ipd: number }>();
        const medMap = new Map<string, { name: string; qty: number; revenue: number }>();
        const docMap = new Map<string, { name: string; revenue: number }>();
        const bills: { billNo: string; patient: string; channel: 'counter' | 'opd' | 'ipd'; doctor: string; date: string; items: number; revenue: number }[] = [];

        const dayKey = (d: Date) => {
            const x = new Date(d);
            return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        };
        const bumpDay = (d: Date, ch: 'counter' | 'opd' | 'ipd', amt: number) => {
            const k = dayKey(d);
            const e = dayMap.get(k) || { counter: 0, opd: 0, ipd: 0 };
            e[ch] += amt;
            dayMap.set(k, e);
        };
        const bumpMed = (desc: string, qty: number, rev: number) => {
            const name = extractMedicineName(desc);
            if (search && !name.toLowerCase().includes(search)) return;
            const e = medMap.get(name) || { name, qty: 0, revenue: 0 };
            e.qty += qty; e.revenue += rev;
            medMap.set(name, e);
        };
        const bumpDoc = (name: string | null | undefined, rev: number) => {
            const key = name || 'Unassigned';
            const e = docMap.get(key) || { name: key, revenue: 0 };
            e.revenue += rev;
            docMap.set(key, e);
        };

        // Counter + OPD
        for (const inv of pharmacyInvoices) {
            const ch: 'counter' | 'opd' = inv.patient_id === 'WALKIN' ? 'counter' : 'opd';
            const rev = Number(inv.net_amount) || 0;
            channels[ch].revenue += rev;
            channels[ch].billCount += 1;
            channels[ch].itemCount += inv.items.length;
            bumpDay(inv.created_at, ch, rev);
            bumpDoc(inv.doctor_name, rev);
            for (const it of inv.items) {
                bumpMed(it.description, Number(it.quantity) || 0, (Number(it.net_price) || 0) + (Number(it.tax_amount) || 0));
            }
            const patientName = ch === 'counter'
                ? (parseWalkinNote(inv.notes).name || 'Walk-in')
                : ((inv.patient as any)?.full_name || inv.patient_id);
            bills.push({
                billNo: inv.invoice_number,
                patient: patientName,
                channel: ch,
                doctor: inv.doctor_name || '—',
                date: inv.created_at.toISOString(),
                items: inv.items.length,
                revenue: rev,
            });
        }

        // IPD — group items by parent invoice (one bill per IPD invoice)
        const ipdBillMap = new Map<number, { billNo: string; patient: string; doctor: string; date: string; items: number; revenue: number }>();
        for (const it of ipdItems) {
            const rev = (Number(it.net_price) || 0) + (Number(it.tax_amount) || 0);
            channels.ipd.revenue += rev;
            channels.ipd.itemCount += 1;
            bumpDay(it.created_at, 'ipd', rev);
            bumpDoc(it.invoice.doctor_name, rev);
            bumpMed(it.description, Number(it.quantity) || 0, rev);
            const existing = ipdBillMap.get(it.invoice.id);
            if (existing) {
                existing.items += 1;
                existing.revenue += rev;
            } else {
                ipdBillMap.set(it.invoice.id, {
                    billNo: it.invoice.invoice_number,
                    patient: (it.invoice.patient as any)?.full_name || it.invoice.patient_id,
                    doctor: it.invoice.doctor_name || '—',
                    date: it.created_at.toISOString(),
                    items: 1,
                    revenue: rev,
                });
            }
        }
        channels.ipd.billCount = ipdBillMap.size;
        for (const b of ipdBillMap.values()) {
            bills.push({ ...b, channel: 'ipd' });
        }

        // -- Corrected gross margin from DISPENSE movement ledger --
        const dispenseMoves = await db.pharmacyInventoryMovement.findMany({
            where: { movement_type: 'DISPENSE', created_at: dateRange },
            select: { quantity_out: true, unit_cost: true },
            take: 20000,
        });
        const cogs = dispenseMoves.reduce((s: number, m: any) => s + (Number(m.unit_cost) || 0) * (m.quantity_out || 0), 0);

        // -- Apply channel filter to outputs --
        const activeChannels: ('counter' | 'opd' | 'ipd')[] =
            channel === 'all' ? ['counter', 'opd', 'ipd'] : [channel];
        const totalRevenue = activeChannels.reduce((s, c) => s + channels[c].revenue, 0);

        // revenueByDay across the range (cap 62 buckets)
        const revenueByDay: { date: string; counter: number; opd: number; ipd: number; revenue: number }[] = [];
        const spanDays = Math.min(Math.ceil((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1, 62);
        const startBucket = new Date(toDate.getTime() - (spanDays - 1) * 24 * 60 * 60 * 1000);
        for (let i = 0; i < spanDays; i++) {
            const d = new Date(startBucket.getTime() + i * 24 * 60 * 60 * 1000);
            const e = dayMap.get(dayKey(d)) || { counter: 0, opd: 0, ipd: 0 };
            const counter = activeChannels.includes('counter') ? e.counter : 0;
            const opd = activeChannels.includes('opd') ? e.opd : 0;
            const ipd = activeChannels.includes('ipd') ? e.ipd : 0;
            revenueByDay.push({
                date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                counter, opd, ipd, revenue: counter + opd + ipd,
            });
        }

        const topMovers = Array.from(medMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
        const byDoctor = Array.from(docMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        // Bills list — respect channel filter, newest first
        const billsList = bills
            .filter(b => activeChannels.includes(b.channel))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 500);

        const pct = (v: number) => (totalRevenue > 0 ? Math.round((v / totalRevenue) * 1000) / 10 : 0);
        const grossMarginPct = totalRevenue > 0 ? Math.round(((totalRevenue - cogs) / totalRevenue) * 1000) / 10 : 0;

        return {
            success: true,
            data: {
                from: fromDate.toISOString(),
                to: toDate.toISOString(),
                totalRevenue,
                cogs: Math.round(cogs),
                grossMarginPct,
                byChannel: {
                    counter: { ...channels.counter, pct: pct(channels.counter.revenue) },
                    opd: { ...channels.opd, pct: pct(channels.opd.revenue) },
                    ipd: { ...channels.ipd, pct: pct(channels.ipd.revenue) },
                },
                totalBills: activeChannels.reduce((s, c) => s + channels[c].billCount, 0),
                revenueByDay,
                topMovers,
                byDoctor,
                bills: billsList,
                activeChannels,
            },
        };
    } catch (error) {
        console.error('Pharmacy Revenue Report Error:', error);
        return { success: false, error: 'Failed to load revenue report' };
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
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

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
        discount_pct?: number;
        discount_amount?: number;   // flat trade discount in ₹
        scheme_amount?: number;     // scheme / free-goods value in ₹
        batch_no?: string;
        expiry?: string;
        pack?: string;
        mrp?: number;
    }>;
}) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId } = await requireTenantContext();

        // Round to 2dp (paise) so each stored line matches the distributor bill.
        const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

        // Taxable per line = gross - percentage discount - flat discount - scheme.
        //   gross   = qty * rate
        //   pctDisc = gross * discount_pct/100
        //   taxable = gross - pctDisc - discount_amount - scheme_amount  (floored at 0)
        const computeTaxable = (l: { quantity: number; unit_price: number; discount_pct?: number; discount_amount?: number; scheme_amount?: number; }) => {
            const gross = Number(l.quantity) * Number(l.unit_price);
            const pctDisc = gross * (Number(l.discount_pct) || 0) / 100;
            const flat = Number(l.discount_amount) || 0;
            const scheme = Number(l.scheme_amount) || 0;
            return Math.max(0, gross - pctDisc - flat - scheme);
        };

        const lines = data.lines.map(line => {
            const taxable = r2(computeTaxable(line));
            const gstAmt = r2(taxable * Number(line.gst_rate) / 100);
            const isInter = false; // TODO: derive from vendor state vs org state
            return {
                ...line,
                discount_pct: Number(line.discount_pct) || 0,
                discount_amount: Number(line.discount_amount) || 0,
                scheme_amount: Number(line.scheme_amount) || 0,
                taxable,
                line_total: r2(taxable + gstAmt),
                cgst_amount: isInter ? 0 : r2(gstAmt / 2),
                sgst_amount: isInter ? 0 : r2(gstAmt / 2),
                igst_amount: isInter ? gstAmt : 0,
            };
        });

        const subtotal = r2(lines.reduce((s, l) => s + l.taxable, 0));
        const totalCgst = r2(lines.reduce((s, l) => s + l.cgst_amount, 0));
        const totalSgst = r2(lines.reduce((s, l) => s + l.sgst_amount, 0));
        const totalIgst = r2(lines.reduce((s, l) => s + l.igst_amount, 0));
        const totalAmount = r2(lines.reduce((s, l) => s + l.line_total, 0));

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
                        discount_pct: l.discount_pct,
                        discount_amount: l.discount_amount,
                        scheme_amount: l.scheme_amount,
                        cgst_amount: l.cgst_amount,
                        sgst_amount: l.sgst_amount,
                        igst_amount: l.igst_amount,
                        line_total: l.line_total,
                        hsn_code: l.hsn_code || null,
                        batch_no: l.batch_no || null,
                        expiry: l.expiry || null,
                        pack: l.pack || null,
                        mrp: l.mrp != null ? Number(l.mrp) : null,
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
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

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

// Parse the free-text expiry captured on a PO line (e.g. "04/31", "04/2031",
// "30/04/2031", "2031-04-30") into a Date. Returns null if unparseable.
function parsePoExpiry(raw: any): Date | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    // DD/MM/YYYY or DD-MM-YYYY
    let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
    if (m) {
        let dd = +m[1], mm = +m[2], yy = +m[3]; if (yy < 100) yy += 2000;
        const dt = new Date(yy, mm - 1, dd);
        if (!isNaN(dt.getTime()) && mm >= 1 && mm <= 12) return dt;
    }
    // MM/YY or MM/YYYY → last day of that month
    m = /^(\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
    if (m) {
        let mm = +m[1], yy = +m[2]; if (yy < 100) yy += 2000;
        if (mm >= 1 && mm <= 12) return new Date(yy, mm, 0);
    }
    // ISO / native-parseable fallback
    const native = new Date(s);
    if (!isNaN(native.getTime()) && native.getFullYear() > 2000 && native.getFullYear() < 2100) return native;
    return null;
}

export async function postPurchaseInvoice(invoiceId: number) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

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

        // Receive the goods into inventory automatically on posting. Batch No.,
        // expiry and MRP are taken from the linked PO line; quantity & cost from
        // the invoice line. Lines already received via a GRN are skipped to avoid
        // double-counting. Done atomically with the status update.
        const poItemIds = invoice.line_items.map((l: any) => l.po_item_id).filter(Boolean);
        const poItemMap = new Map<number, any>();
        if (poItemIds.length) {
            const poItems = await db.purchaseOrderItem.findMany({ where: { id: { in: poItemIds } } });
            for (const pi of poItems) poItemMap.set(pi.id, pi);
        }

        await db.$transaction(async (tx: any) => {
            for (const line of invoice.line_items) {
                if (line.grn_id) continue;                 // already received via GRN
                if (Number(line.quantity) <= 0) continue;
                const poItem = line.po_item_id ? poItemMap.get(line.po_item_id) : null;
                const batchNo = (line.batch_no || poItem?.batch_no || '').trim() || `PI-${invoice.invoice_number}`;
                // Expiry: from line, then from PO line; fall back to ~2 years out.
                const expiryDate = parsePoExpiry(line.expiry || poItem?.expiry) || new Date(Date.now() + 730 * 24 * 60 * 60 * 1000);
                const mrp = line.mrp != null ? Number(line.mrp) : (poItem?.mrp != null ? Number(poItem.mrp) : null);

                const batchRecord = await tx.pharmacy_batch_inventory.upsert({
                    where: { medicine_id_batch_no: { medicine_id: line.medicine_id, batch_no: batchNo } },
                    update: {
                        current_stock: { increment: Number(line.quantity) },
                        cost_price: Number(line.unit_price),
                        actual_cost: Number(line.unit_price),
                        vendor_id: invoice.vendor_id,
                        expiry_date: expiryDate,
                        ...(mrp != null ? { mrp } : {}),
                    },
                    create: {
                        medicine_id: line.medicine_id,
                        batch_no: batchNo,
                        current_stock: Number(line.quantity),
                        expiry_date: expiryDate,
                        cost_price: Number(line.unit_price),
                        actual_cost: Number(line.unit_price),
                        mrp,
                        vendor_id: invoice.vendor_id,
                        rack_location: 'PURCHASE-INVOICE',
                    },
                });

                // Carry the supplier's pack size onto the product so the sale bill
                // can print it. It's captured per purchase line but is a property
                // of the medicine — without this it never leaves the buying side.
                const linePack = (line.pack || poItem?.pack || '').trim();
                if (linePack) {
                    await tx.pharmacy_medicine_master.updateMany({
                        where: { id: line.medicine_id, organizationId },
                        data: { pack: linePack.slice(0, 32) },
                    });
                }

                // Record inventory movement
                await tx.pharmacyInventoryMovement.create({
                    data: {
                        organizationId,
                        medicine_id: line.medicine_id,
                        batch_id: batchRecord.id,
                        movement_type: 'GRN_RECEIPT',
                        quantity_in: Number(line.quantity),
                        unit_cost: Number(line.unit_price),
                        balance_after: batchRecord.current_stock,
                        source_type: 'PURCHASE_INVOICE',
                        source_id: String(invoice.id),
                    }
                });

                // Mark the PO line received so a later GRN won't double-receive it.
                if (line.po_item_id) {
                    await tx.purchaseOrderItem.update({
                        where: { id: line.po_item_id },
                        data: { quantity_received: { increment: Number(line.quantity) } },
                    }).catch(() => { /* PO line may be gone — ignore */ });
                }
            }

            await tx.pharmacyPurchaseInvoice.update({
                where: { id: invoiceId },
                data: { status: 'Posted', gl_posted: true },
            });
        });

        revalidatePath('/pharmacy/purchase-invoices');
        revalidatePath('/pharmacy/inventory');
        invalidatePharmacyTags(['stock']);
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
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

    try {
        const { db } = await requireTenantContext();

        const invoice = await db.pharmacyPurchaseInvoice.findUnique({
            where: { id: data.invoice_id },
            include: { vendor: true }
        });
        if (!invoice) return { success: false, error: 'Invoice not found' };
        if (!['Posted', 'OnCredit', 'PartiallyPaid'].includes(invoice.status)) {
            return { success: false, error: 'Invoice must be Posted, OnCredit, or PartiallyPaid' };
        }

        // Credit = purchase on supplier account — payable stays open, no cash/bank movement.
        // Update status to OnCredit so the UI reflects the payment mode chosen.
        if (data.payment_method === 'Credit') {
            await db.pharmacyPurchaseInvoice.update({
                where: { id: data.invoice_id },
                data: { status: 'OnCredit' },
            });
            revalidatePath('/pharmacy/purchase-invoices');
            return { success: true, fully_paid: false, on_credit: true };
        }

        if (!data.amount || data.amount <= 0) {
            return { success: false, error: 'Enter a valid payment amount' };
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
            const creditAccount = data.payment_method === 'Cash' ? '1000' : '1010';
            await postPharmacyJournal(db, invoice.organizationId, {
                narration: `Supplier payment: ${invoice.vendor?.vendor_name} — ${invoice.invoice_number}`,
                reference_number: `SUPPAY-${invoice.invoice_number}-${Date.now()}`,
                lines: [
                    { account_code: '3110', debit: data.amount, credit: 0, description: 'Vendor payable settlement' },
                    { account_code: creditAccount, debit: 0, credit: data.amount, description: `Payment via ${data.payment_method}` },
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
    const denied = await denyUnlessPharmacyRole(PHARMACY_PROCUREMENT_ROLES);
    if (denied) return denied;

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
    adjustment_qty?: number; // positive = add, negative = deduct
    target_stock_qty?: number; // direct target stock count (e.g. 50)
    reason: string;
}) {
    const denied = await denyUnlessPharmacyRole(PHARMACY_OPERATE_ROLES);
    if (denied) return denied;

    try {
        const { db, organizationId, session } = await requireTenantContext();

        // pharmacy_batch_inventory has no organizationId column and so is absent
        // from TENANT_SCOPED_MODELS — the $extends auto-scoping does NOT cover it.
        // Ownership has to be proven through the parent medicine, exactly as
        // updateBatchDetails does; without this a crafted batch_id edits another
        // hospital's stock. `medicine_id` is then taken from the batch rather than
        // from the caller, so the movement ledger and narcotic register can't be
        // written against an arbitrary medicine either.
        const batch = await db.pharmacy_batch_inventory.findUnique({
            where: { id: data.batch_id },
            include: { medicine: { select: { organizationId: true } } },
        });
        if (!batch || batch.medicine.organizationId !== organizationId) {
            return { success: false, error: 'Batch not found' };
        }
        const medicineId = batch.medicine_id;

        let adjQty = data.adjustment_qty ?? 0;
        if (data.target_stock_qty !== undefined) {
            adjQty = data.target_stock_qty - batch.current_stock;
        }

        const newStock = batch.current_stock + adjQty;
        if (newStock < 0) return { success: false, error: 'Adjustment would result in negative stock' };

        const updated = await db.pharmacy_batch_inventory.update({
            where: { id: data.batch_id },
            data: { current_stock: newStock }
        });

        await db.pharmacyInventoryMovement.create({
            data: {
                organizationId,
                medicine_id: medicineId,
                batch_id: data.batch_id,
                movement_type: 'ADJUSTMENT',
                quantity_in: adjQty > 0 ? adjQty : 0,
                quantity_out: adjQty < 0 ? Math.abs(adjQty) : 0,
                unit_cost: Number(batch.actual_cost || batch.cost_price || 0),
                balance_after: updated.current_stock,
                source_type: 'ADJUSTMENT',
                user_id: session.id,
                reason: data.reason,
            }
        });

        // Narcotic register for controlled drugs
        const medicine = await db.pharmacy_medicine_master.findUnique({ where: { id: medicineId } });
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
                    quantity_in: adjQty > 0 ? adjQty : 0,
                    quantity_out: adjQty < 0 ? Math.abs(adjQty) : 0,
                    balance: (lastEntry?.balance || 0) + adjQty,
                    transaction_type: adjQty > 0 ? 'IN' : 'OUT',
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
