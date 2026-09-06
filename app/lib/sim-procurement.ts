/**
 * Buying back what the pharmacy dispensed.
 *
 * The pharmacy dashboard derives gross margin from thirty days of PURCHASE ORDERS, not
 * from the inventory ledger — so a simulation that dispensed stock without ever buying
 * any reported a cost of goods of zero and a gross margin of 100%.
 *
 * The fix is not to book the opening stock as a purchase. A hospital enters opening
 * stock as a balance, and booking eight lakh of inventory against a few thousand rupees
 * of sales would swing the same figure hugely negative instead. What a pharmacy actually
 * does is reorder what it sold, so that is what this does: once a day it reads the
 * dispense ledger since the last order and raises one purchase order covering exactly
 * that, at cost. Thirty-day purchases then track thirty-day cost of goods and the margin
 * lands where it should.
 *
 * Suppliers are the ones cloned from the source hospital. A hospital with no suppliers
 * on file gets no purchase orders and keeps the 100% margin — there is nobody to buy
 * from, and inventing a distributor would put a fictional trading partner on screen.
 *
 * Plain library. Never add 'use server'.
 */
import { prisma } from '@/backend/db';
import { minutesIntoDay } from '@/app/lib/sim-staff';

/** A day between orders. Real pharmacies order on a cycle, not per prescription. */
const ORDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Local hour the day's order goes to the distributor. */
const ORDER_HOUR = 18;

export interface ProcurementResult {
    ordered: boolean;
    poNumber?: string;
    lines?: number;
    amount?: number;
    reason?: string;
}

/**
 * Raise the day's purchase order, if one is due.
 *
 * Deliberately stateless: "when was the last order" is read from the most recent
 * PurchaseOrder rather than a marker column, so it is self-correcting after a reset and
 * needs no migration of its own.
 */
export async function runProcurement(
    orgId: string,
    now: Date,
    timezone = 'Asia/Kolkata',
): Promise<ProcurementResult> {
    // Evening indent to the distributor, so one order covers the day that has just been
    // worked. Ordering on the first tick that saw any dispensing bought two lines and
    // then blocked itself for 24 hours, leaving the rest of the day's stock unpaid for.
    if (minutesIntoDay(now, timezone) < ORDER_HOUR * 60) {
        return { ordered: false, reason: 'the daily order goes out in the evening' };
    }

    const config = await prisma.organizationConfig.findUnique({
        where: { organizationId: orgId },
        select: { simulation_procurement_enabled: true },
    });
    if (!config?.simulation_procurement_enabled) return { ordered: false, reason: 'procurement is switched off' };

    const suppliers = await prisma.pharmacySupplier.findMany({
        where: { organizationId: orgId, is_active: true },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
    });
    if (!suppliers.length) {
        return { ordered: false, reason: 'the hospital has no suppliers on file' };
    }

    const lastOrder = await prisma.purchaseOrder.findFirst({
        where: { organizationId: orgId },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
    });
    const since = lastOrder?.created_at ?? new Date(now.getTime() - ORDER_INTERVAL_MS);
    if (lastOrder && now.getTime() - lastOrder.created_at.getTime() < ORDER_INTERVAL_MS) {
        return { ordered: false, reason: 'already ordered today' };
    }

    // What actually went out of the door since the last order.
    const movements = await prisma.pharmacyInventoryMovement.findMany({
        where: {
            organizationId: orgId,
            movement_type: 'DISPENSE',
            created_at: { gt: since, lte: now },
        },
        select: { medicine_id: true, quantity_out: true, unit_cost: true },
        take: 5000,
    });
    if (!movements.length) return { ordered: false, reason: 'nothing dispensed since the last order' };

    const consumed = new Map<number, { qty: number; cost: number }>();
    for (const m of movements) {
        if (!m.medicine_id) continue;
        const row = consumed.get(m.medicine_id) ?? { qty: 0, cost: 0 };
        row.qty += m.quantity_out ?? 0;
        // Last cost seen wins; batches of one drug are bought at close to the same price.
        row.cost = Number(m.unit_cost) || row.cost;
        consumed.set(m.medicine_id, row);
    }
    if (!consumed.size) return { ordered: false, reason: 'nothing dispensed since the last order' };

    const medicines = await prisma.pharmacy_medicine_master.findMany({
        where: { organizationId: orgId, id: { in: [...consumed.keys()] } },
        select: { id: true, gst_percent: true, hsn_sac_code: true, selling_price: true },
    });
    const metaById = new Map(medicines.map(m => [m.id, m]));

    // Rotate through the hospital's distributors rather than sending every order to the
    // first one — a purchase ledger with a single supplier on every line looks generated.
    const supplier = suppliers[
        Math.floor(now.getTime() / ORDER_INTERVAL_MS) % suppliers.length
    ];

    // The order carries BOTH links. supplier_id is the required FK onto the legacy
    // pharmacy_suppliers table; vendor_id is what the Suppliers screen and the newer
    // procurement reports read, and leaving it null orphans the order from them.
    const vendor = await prisma.vendor.findFirst({
        where: { organizationId: orgId, vendor_name: supplier.name },
        select: { id: true },
    });

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { code: true } });
    const seq = await prisma.purchaseOrder.count({ where: { organizationId: orgId } });
    const poNumber = `${org?.code || 'HOS'}-PO-${String(now.getFullYear()).slice(2)}-${String(seq + 1).padStart(4, '0')}`;

    const lines = [...consumed.entries()].map(([medicineId, row]) => {
        const meta = metaById.get(medicineId);
        const unit = row.cost || Number(meta?.selling_price || 0) * 0.72;
        const amount = Number((unit * row.qty).toFixed(2));
        const gst = Number(meta?.gst_percent) || 0;
        return {
            medicine_id: medicineId,
            quantity_ordered: row.qty,
            quantity_received: row.qty,
            unit_price: Number(unit.toFixed(2)),
            amount,
            gst_rate: gst,
            cgst_rate: gst / 2,
            sgst_rate: gst / 2,
            hsn_code: meta?.hsn_sac_code ?? null,
            mrp: Number(meta?.selling_price || 0),
        };
    });

    const total = Number(lines.reduce((sum, l) => sum + l.amount, 0).toFixed(2));
    const gstAmount = Number(
        lines.reduce((sum, l) => sum + l.amount * (l.gst_rate / 100), 0).toFixed(2),
    );

    // Ordered a couple of days before it landed, which is what the paperwork shows.
    const orderedAt = new Date(now.getTime() - 2 * ORDER_INTERVAL_MS);

    const po = await prisma.purchaseOrder.create({
        data: {
            po_number: poNumber,
            supplier_id: supplier.id,
            vendor_id: vendor?.id ?? null,
            status: 'Received',
            total_amount: total,
            gst_amount: gstAmount,
            ordered_at: orderedAt,
            approved_at: orderedAt,
            received_at: now,
            organizationId: orgId,
            created_at: now,
        } as any,
    });

    for (const l of lines) {
        await prisma.purchaseOrderItem.create({ data: { po_id: po.id, ...l } as any });
    }

    return { ordered: true, poNumber, lines: lines.length, amount: total };
}
