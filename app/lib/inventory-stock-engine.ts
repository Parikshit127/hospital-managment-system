/**
 * Shared inventory stock mutation engine — moving average, FEFO, row locks.
 * Used by all inventory server actions.
 */

import { calcMovingAverage } from '@/app/lib/inventory-utils';

export type StockAllocation = {
  batch_id: number | null;
  quantity: number;
  unit_cost: number;
  stock_id: number;
};

export async function lockStoreStockRow(tx: any, storeId: number, itemId: number, batchId: number | null) {
  const batchClause = batchId == null ? 'batch_id IS NULL' : `batch_id = ${batchId}`;
  await tx.$executeRawUnsafe(
    `SELECT id FROM store_stocks WHERE store_id = ${storeId} AND item_id = ${itemId} AND ${batchClause} FOR UPDATE`,
  );
}

export async function upsertStoreStock(
  tx: any,
  organizationId: string,
  storeId: number,
  itemId: number,
  batchId: number | null,
  qtyDelta: number,
  unitCost: number,
) {
  await lockStoreStockRow(tx, storeId, itemId, batchId);

  const existing = await tx.store_stocks.findFirst({
    where: { store_id: storeId, item_id: itemId, batch_id: batchId },
  });

  if (existing) {
    const newQty = existing.quantity_on_hand + qtyDelta;
    if (newQty < 0) throw new Error('Insufficient stock');
    const newAvg =
      qtyDelta > 0
        ? calcMovingAverage(existing.quantity_on_hand, existing.avg_unit_cost, qtyDelta, unitCost)
        : existing.avg_unit_cost;
    return tx.store_stocks.update({
      where: { id: existing.id },
      data: { quantity_on_hand: newQty, avg_unit_cost: newAvg, updated_at: new Date() },
    });
  }

  if (qtyDelta < 0) throw new Error('Insufficient stock');
  return tx.store_stocks.create({
    data: {
      store_id: storeId,
      item_id: itemId,
      batch_id: batchId,
      quantity_on_hand: qtyDelta,
      quantity_reserved: 0,
      avg_unit_cost: unitCost,
      organizationId,
      updated_at: new Date(),
    },
  });
}

export async function allocateFefo(
  tx: any,
  storeId: number,
  itemId: number,
  qty: number,
): Promise<StockAllocation[]> {
  const stocks = await tx.store_stocks.findMany({
    where: { store_id: storeId, item_id: itemId, quantity_on_hand: { gt: 0 } },
    include: { item_batches: true },
    orderBy: { item_batches: { expiry_date: 'asc' } },
  });

  const allocations: StockAllocation[] = [];
  let remaining = qty;

  for (const s of stocks) {
    if (remaining <= 0) break;
    if (s.item_batches?.is_quarantined) continue;
    const available = s.quantity_on_hand - s.quantity_reserved;
    const take = Math.min(available, remaining);
    if (take <= 0) continue;
    allocations.push({
      batch_id: s.batch_id,
      quantity: take,
      unit_cost: s.avg_unit_cost,
      stock_id: s.id,
    });
    remaining -= take;
  }

  if (remaining > 0) throw new Error(`Short stock: ${remaining} units unavailable`);
  return allocations;
}

export async function recordMovement(
  tx: any,
  params: {
    organizationId: string;
    store_id: number;
    item_id: number;
    batch_id?: number | null;
    movement_type: string;
    quantity_in: number;
    quantity_out: number;
    unit_cost: number;
    balance_after: number;
    source_type?: string;
    source_id?: string;
    cost_center?: string;
    patient_id?: string;
    admission_id?: string;
    user_id?: string;
    reason?: string;
    gl_journal_id?: string;
    gl_posted?: boolean;
  },
) {
  return tx.inventory_movements.create({
    data: {
      ...params,
      batch_id: params.batch_id ?? null,
      value: (params.quantity_in - params.quantity_out) * params.unit_cost,
      gl_posted: params.gl_posted ?? !!params.gl_journal_id,
      created_at: new Date(),
    },
  });
}

export async function issueStockAllocations(
  tx: any,
  organizationId: string,
  storeId: number,
  itemId: number,
  allocations: StockAllocation[],
  movementType: string,
  meta: {
    source_type?: string;
    source_id?: string;
    cost_center?: string;
    patient_id?: string;
    admission_id?: string;
    user_id?: string;
    reason?: string;
  },
) {
  for (const alloc of allocations) {
    const stock = await upsertStoreStock(
      tx,
      organizationId,
      storeId,
      itemId,
      alloc.batch_id,
      -alloc.quantity,
      alloc.unit_cost,
    );
    await recordMovement(tx, {
      organizationId,
      store_id: storeId,
      item_id: itemId,
      batch_id: alloc.batch_id,
      movement_type: movementType,
      quantity_in: 0,
      quantity_out: alloc.quantity,
      unit_cost: alloc.unit_cost,
      balance_after: stock.quantity_on_hand,
      ...meta,
    });
  }
}

export async function receiveStock(
  tx: any,
  organizationId: string,
  storeId: number,
  itemId: number,
  batchId: number | null,
  qty: number,
  unitCost: number,
  movementType: string,
  meta: Parameters<typeof recordMovement>[1] extends infer P ? Omit<P, 'organizationId' | 'store_id' | 'item_id' | 'batch_id' | 'movement_type' | 'quantity_in' | 'quantity_out' | 'unit_cost' | 'balance_after'> : never,
) {
  const stock = await upsertStoreStock(tx, organizationId, storeId, itemId, batchId, qty, unitCost);
  await recordMovement(tx, {
    organizationId,
    store_id: storeId,
    item_id: itemId,
    batch_id: batchId,
    movement_type: movementType,
    quantity_in: qty,
    quantity_out: 0,
    unit_cost: unitCost,
    balance_after: stock.quantity_on_hand,
    ...meta,
  });
  return stock;
}
