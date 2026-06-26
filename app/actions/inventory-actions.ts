'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAuditEvent } from '@/app/actions/audit-actions';
import {
  INVENTORY_ADMIN_ROLES,
  INVENTORY_FINANCE_ROLES,
  INVENTORY_INDENT_ROLES,
  INVENTORY_ISSUE_ROLES,
  INVENTORY_PROCUREMENT_ROLES,
  INVENTORY_VIEW_ROLES,
} from '@/app/lib/inventory-roles';
import { calcMovingAverage, nextDocNumber } from '@/app/lib/inventory-utils';
import { ensureDefaultStores } from '@/app/actions/store-actions';
import {
  upsertStoreStock,
  recordMovement,
  allocateFefo,
} from '@/app/lib/inventory-stock-engine';
import { postGrnToGL, postAdjustmentToGL } from '@/app/actions/inventory-gl-actions';

function revalidateAll() {
  [
    '/inventory/dashboard',
    '/inventory/stock',
    '/inventory/procurement',
    '/inventory/transfers',
    '/inventory/counts',
    '/inventory/reports',
  ].forEach((p) => revalidatePath(p));
}

export async function getInventoryDashboardStats() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    await ensureDefaultStores();

    const [
      storeCount,
      itemCount,
      pendingIndents,
      openPRs,
      stockRows,
      expiringBatches,
      recentMovements,
    ] = await Promise.all([
      db.stores.count({ where: { is_active: true } }),
      db.item_master.count({ where: { status: 'Active' } }),
      db.indents.count({ where: { status: { in: ['Submitted', 'Approved', 'Partially Issued'] } } }),
      db.purchase_requisitions.count({ where: { status: { in: ['Submitted', 'Approved'] } } }),
      db.store_stocks.findMany({
        select: { quantity_on_hand: true, avg_unit_cost: true, item_id: true },
      }),
      db.item_batches.count({
        where: {
          is_quarantined: false,
          expiry_date: { lte: new Date(Date.now() + 90 * 86400000), gte: new Date() },
        },
      }),
      db.inventory_movements.findMany({
        orderBy: { created_at: 'desc' },
        take: 10,
        include: {
          item_master: { select: { item_code: true, name: true } },
          stores: { select: { name: true } },
        },
      }),
    ]);

    let totalValue = 0;
    const itemStockMap = new Map<number, number>();
    for (const s of stockRows) {
      totalValue += s.quantity_on_hand * s.avg_unit_cost;
      itemStockMap.set(s.item_id, (itemStockMap.get(s.item_id) || 0) + s.quantity_on_hand);
    }

    const items = await db.item_master.findMany({
      where: { status: 'Active', reorder_point: { gt: 0 } },
      select: { id: true, name: true, item_code: true, reorder_point: true },
    });
    const lowStock = items.filter((i: { id: number; reorder_point: number }) => (itemStockMap.get(i.id) || 0) <= i.reorder_point);

    return {
      success: true,
      data: {
        storeCount,
        itemCount,
        pendingIndents,
        openPRs,
        totalStockValue: Math.round(totalValue),
        lowStockCount: lowStock.length,
        lowStockItems: lowStock.slice(0, 8),
        expiringBatches,
        recentMovements,
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getStockOnHand(params?: {
  store_id?: number;
  query?: string;
  low_stock_only?: boolean;
}) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const where: any = {};
    if (params?.store_id) where.store_id = params.store_id;

    const stocks = await db.store_stocks.findMany({
      where,
      include: {
        item_master: {
          select: {
            id: true,
            item_code: true,
            name: true,
            base_uom: true,
            reorder_point: true,
            is_batch_tracked: true,
            item_categories: { select: { name: true } },
          },
        },
        stores: { select: { id: true, name: true, store_code: true } },
        item_batches: { select: { batch_no: true, expiry_date: true, is_quarantined: true } },
      },
      orderBy: [{ store_id: 'asc' }, { item_id: 'asc' }],
    });

    let rows = stocks.map((s: any) => ({
      ...s,
      value: s.quantity_on_hand * s.avg_unit_cost,
      available: s.quantity_on_hand - s.quantity_reserved,
    }));

    if (params?.query?.trim()) {
      const q = params.query.trim().toLowerCase();
      rows = rows.filter(
        (r: any) =>
          r.item_master.name.toLowerCase().includes(q) ||
          r.item_master.item_code.toLowerCase().includes(q),
      );
    }
    if (params?.low_stock_only) {
      rows = rows.filter(
        (r: any) =>
          r.item_master.reorder_point > 0 &&
          r.quantity_on_hand <= r.item_master.reorder_point,
      );
    }

    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getMovementLedger(params?: {
  store_id?: number;
  item_id?: number;
  page?: number;
  limit?: number;
}) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const where: any = {};
    if (params?.store_id) where.store_id = params.store_id;
    if (params?.item_id) where.item_id = params.item_id;

    const [rows, total] = await Promise.all([
      db.inventory_movements.findMany({
        where,
        include: {
          item_master: { select: { item_code: true, name: true } },
          stores: { select: { name: true, store_code: true } },
          item_batches: { select: { batch_no: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.inventory_movements.count({ where }),
    ]);
    return { success: true, data: rows, pagination: { page, limit, total } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function receiveGrn(data: {
  store_id: number;
  vendor_id?: number;
  po_id?: number;
  remarks?: string;
  lines: Array<{
    item_id: number;
    quantity_accepted: number;
    quantity_rejected?: number;
    batch_no?: string;
    expiry_date?: string;
    unit_price: number;
    rejection_reason?: string;
  }>;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([
      ...INVENTORY_PROCUREMENT_ROLES,
      ...INVENTORY_ISSUE_ROLES,
    ]);
    if (!data.lines?.length) return { success: false, error: 'No lines provided' };

    const store = await db.stores.findFirst({ where: { id: data.store_id } });
    if (!store) return { success: false, error: 'Store not found' };

    const grnNumber = await nextDocNumber(db, 'GRN', 'goods_receipt_notes', 'grn_number');
    let totalAmount = 0;
    const movementIds: number[] = [];

    const result = await db.$transaction(async (tx: any) => {
      const grn = await tx.goods_receipt_notes.create({
        data: {
          grn_number: grnNumber,
          po_id: data.po_id || null,
          vendor_id: data.vendor_id || null,
          storeId: data.store_id,
          received_by: session.username,
          remarks: data.remarks,
          organizationId,
          total_amount: 0,
        },
      });

      for (const line of data.lines) {
        const item = await tx.item_master.findFirst({ where: { id: line.item_id } });
        if (!item) throw new Error(`Item ${line.item_id} not found`);

        const accepted = line.quantity_accepted;
        if (accepted <= 0) continue;
        totalAmount += accepted * line.unit_price;

        if (data.po_id) {
          const poItem = await tx.purchaseOrderItem.findFirst({
            where: { po_id: data.po_id, itemMasterId: line.item_id },
          });
          if (poItem) {
            await tx.purchaseOrderItem.update({
              where: { id: poItem.id },
              data: {
                quantity_received: Number(poItem.quantity_received || 0) + accepted,
              },
            });
          }
        }

        let batchId: number | null = null;
        if (item.is_batch_tracked) {
          const batchNo = line.batch_no || `B-${Date.now()}`;
          const batch = await tx.item_batches.upsert({
            where: { item_id_batch_no: { item_id: line.item_id, batch_no: batchNo } },
            create: {
              item_id: line.item_id,
              batch_no: batchNo,
              expiry_date: line.expiry_date ? new Date(line.expiry_date) : null,
              cost_price: line.unit_price,
              grn_id: grn.id,
              vendor_id: data.vendor_id || null,
              organizationId,
              updated_at: new Date(),
            },
            update: {
              cost_price: line.unit_price,
              grn_id: grn.id,
              updated_at: new Date(),
            },
          });
          batchId = batch.id;
        }

        const stock = await upsertStoreStock(
          tx,
          organizationId,
          data.store_id,
          line.item_id,
          batchId,
          accepted,
          line.unit_price,
        );

        await tx.goods_receipt_note_items.create({
          data: {
            grn_id: grn.id,
            item_id: line.item_id,
            quantity_accepted: accepted,
            quantity_rejected: line.quantity_rejected || 0,
            rejection_reason: line.rejection_reason,
            batch_no: line.batch_no,
            expiry_date: line.expiry_date ? new Date(line.expiry_date) : null,
            unit_price: line.unit_price,
            gst_rate: item.gst_rate,
          },
        });

        const mov = await recordMovement(tx, {
          organizationId,
          store_id: data.store_id,
          item_id: line.item_id,
          batch_id: batchId,
          movement_type: 'GRN_RECEIPT',
          quantity_in: accepted,
          quantity_out: 0,
          unit_cost: line.unit_price,
          balance_after: stock.quantity_on_hand,
          source_type: 'GRN',
          source_id: String(grn.id),
          cost_center: store.cost_center || undefined,
          user_id: session.id,
        });
        movementIds.push(mov.id);
      }

      await tx.goods_receipt_notes.update({
        where: { id: grn.id },
        data: { total_amount: totalAmount },
      });

      return grn;
    });

    const glRes = await postGrnToGL(result.id, movementIds);

    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'GRN_RECEIPT',
      module: 'inventory',
      entityType: 'GRN',
      entityId: String(result.id),
      details: `GRN ${grnNumber} received at ${store.name}`,
    });
    revalidateAll();
    return { success: true, data: result, glPosted: glRes.success };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function recordOpeningStock(data: {
  store_id: number;
  lines: Array<{ item_id: number; quantity: number; unit_cost: number; batch_no?: string; expiry_date?: string }>;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    const store = await db.stores.findFirst({ where: { id: data.store_id } });
    if (!store) return { success: false, error: 'Store not found' };

    await db.$transaction(async (tx: any) => {
      for (const line of data.lines) {
        const item = await tx.item_master.findFirst({ where: { id: line.item_id } });
        if (!item) throw new Error(`Item ${line.item_id} not found`);

        let batchId: number | null = null;
        if (item.is_batch_tracked) {
          const batchNo = line.batch_no || 'OPENING';
          const batch = await tx.item_batches.upsert({
            where: { item_id_batch_no: { item_id: line.item_id, batch_no: batchNo } },
            create: {
              item_id: line.item_id,
              batch_no: batchNo,
              expiry_date: line.expiry_date ? new Date(line.expiry_date) : null,
              cost_price: line.unit_cost,
              organizationId,
              updated_at: new Date(),
            },
            update: { updated_at: new Date() },
          });
          batchId = batch.id;
        }

        const stock = await upsertStoreStock(
          tx,
          organizationId,
          data.store_id,
          line.item_id,
          batchId,
          line.quantity,
          line.unit_cost,
        );

        await recordMovement(tx, {
          organizationId,
          store_id: data.store_id,
          item_id: line.item_id,
          batch_id: batchId,
          movement_type: 'OPENING',
          quantity_in: line.quantity,
          quantity_out: 0,
          unit_cost: line.unit_cost,
          balance_after: stock.quantity_on_hand,
          source_type: 'OPENING',
          cost_center: store.cost_center || undefined,
          user_id: session.id,
        });
      }
    });

    revalidateAll();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function listGRNs(limit = 30) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const rows = await db.goods_receipt_notes.findMany({
      where: { goods_receipt_note_items: { some: {} } },
      include: {
        stores: { select: { name: true } },
        goods_receipt_note_items: {
          include: { item_master: { select: { item_code: true, name: true } } },
        },
        vendor: { select: { vendor_name: true } },
      },
      orderBy: { received_at: 'desc' },
      take: limit,
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function listPurchaseRequisitions(status?: string) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const where: any = {};
    if (status) where.status = status;
    const rows = await db.purchase_requisitions.findMany({
      where,
      include: {
        stores: { select: { name: true, store_code: true } },
        purchase_requisition_items: {
          include: { item_master: { select: { item_code: true, name: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createPurchaseRequisition(data: {
  requesting_store_id: number;
  priority?: string;
  lines: Array<{ item_id: number; quantity: number; required_by?: string; notes?: string }>;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([
      ...INVENTORY_PROCUREMENT_ROLES,
      ...INVENTORY_INDENT_ROLES,
    ]);
    const prNumber = await nextDocNumber(db, 'PR', 'purchase_requisitions', 'pr_number');

    const pr = await db.purchase_requisitions.create({
      data: {
        pr_number: prNumber,
        requesting_store_id: data.requesting_store_id,
        priority: data.priority || 'NORMAL',
        status: 'Draft',
        organizationId,
        updated_at: new Date(),
        purchase_requisition_items: {
          create: data.lines.map((l) => ({
            item_id: l.item_id,
            quantity: l.quantity,
            required_by: l.required_by ? new Date(l.required_by) : null,
            notes: l.notes,
          })),
        },
      },
      include: { purchase_requisition_items: true },
    });

    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'CREATE',
      module: 'inventory',
      entityType: 'PR',
      entityId: String(pr.id),
      details: `Created PR ${prNumber}`,
    });
    revalidatePath('/inventory/procurement');
    return { success: true, data: pr };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updatePRStatus(id: number, status: string) {
  try {
    const { db, session } = await requireRoleAndTenant([...INVENTORY_PROCUREMENT_ROLES]);
    const pr = await db.purchase_requisitions.update({
      where: { id },
      data: {
        status,
        approved_by: ['Approved', 'Rejected'].includes(status) ? session.username : undefined,
        approved_at: ['Approved', 'Rejected'].includes(status) ? new Date() : undefined,
        updated_at: new Date(),
      },
    });
    revalidatePath('/inventory/procurement');
    return { success: true, data: pr };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function listTransfers() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const rows = await db.stock_transfers.findMany({
      include: {
        stores_stock_transfers_from_store_idTostores: { select: { name: true } },
        stores_stock_transfers_to_store_idTostores: { select: { name: true } },
        stock_transfer_items: {
          include: { item_master: { select: { item_code: true, name: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createTransfer(data: {
  from_store_id: number;
  to_store_id: number;
  lines: Array<{ item_id: number; quantity: number; batch_id?: number }>;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_ISSUE_ROLES]);
    const transferNumber = await nextDocNumber(db, 'TRF', 'stock_transfers', 'transfer_number');

    const transfer = await db.$transaction(async (tx: any) => {
      const doc = await tx.stock_transfers.create({
        data: {
          transfer_number: transferNumber,
          from_store_id: data.from_store_id,
          to_store_id: data.to_store_id,
          status: 'Draft',
          organizationId,
          updated_at: new Date(),
        },
      });

      for (const line of data.lines) {
        const stocks = await tx.store_stocks.findMany({
          where: {
            store_id: data.from_store_id,
            item_id: line.item_id,
            quantity_on_hand: { gt: 0 },
            ...(line.batch_id ? { batch_id: line.batch_id } : {}),
          },
          orderBy: line.batch_id ? undefined : { item_batches: { expiry_date: 'asc' } },
        });

        let remaining = line.quantity;
        for (const stock of stocks) {
          if (remaining <= 0) break;
          const take = Math.min(stock.quantity_on_hand, remaining);
          const unitCost = stock.avg_unit_cost;

          await upsertStoreStock(tx, organizationId, data.from_store_id, line.item_id, stock.batch_id, -take, unitCost);
          const outStock = await tx.store_stocks.findFirst({
            where: { store_id: data.from_store_id, item_id: line.item_id, batch_id: stock.batch_id },
          });

          await tx.stock_transfer_items.create({
            data: {
              transfer_id: doc.id,
              item_id: line.item_id,
              batch_id: stock.batch_id,
              quantity: take,
              unit_cost: unitCost,
            },
          });

          await recordMovement(tx, {
            organizationId,
            store_id: data.from_store_id,
            item_id: line.item_id,
            batch_id: stock.batch_id,
            movement_type: 'TRANSFER_OUT',
            quantity_in: 0,
            quantity_out: take,
            unit_cost: unitCost,
            balance_after: outStock?.quantity_on_hand ?? 0,
            source_type: 'TRANSFER',
            source_id: String(doc.id),
            user_id: session.id,
          });

          remaining -= take;
        }
        if (remaining > 0) throw new Error(`Insufficient stock for item ${line.item_id}`);
      }

      return doc;
    });

    revalidatePath('/inventory/transfers');
    return { success: true, data: transfer };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function dispatchTransfer(id: number) {
  try {
    const { db, session } = await requireRoleAndTenant([...INVENTORY_ISSUE_ROLES]);
    const transfer = await db.stock_transfers.update({
      where: { id },
      data: {
        status: 'In Transit',
        dispatch_user_id: session.id,
        dispatch_at: new Date(),
        updated_at: new Date(),
      },
    });
    revalidatePath('/inventory/transfers');
    return { success: true, data: transfer };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function receiveTransfer(id: number) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_ISSUE_ROLES]);
    const transfer = await db.stock_transfers.findFirst({
      where: { id },
      include: { stock_transfer_items: true },
    });
    if (!transfer) return { success: false, error: 'Transfer not found' };
    if (transfer.status !== 'In Transit') {
      return { success: false, error: 'Transfer is not in transit' };
    }

    await db.$transaction(async (tx: any) => {
      for (const line of transfer.stock_transfer_items) {
        const stock = await upsertStoreStock(
          tx,
          organizationId,
          transfer.to_store_id,
          line.item_id,
          line.batch_id,
          line.quantity,
          line.unit_cost,
        );
        await recordMovement(tx, {
          organizationId,
          store_id: transfer.to_store_id,
          item_id: line.item_id,
          batch_id: line.batch_id,
          movement_type: 'TRANSFER_IN',
          quantity_in: line.quantity,
          quantity_out: 0,
          unit_cost: line.unit_cost,
          balance_after: stock.quantity_on_hand,
          source_type: 'TRANSFER',
          source_id: String(transfer.id),
          user_id: session.id,
        });
      }
      await tx.stock_transfers.update({
        where: { id },
        data: {
          status: 'Received',
          receive_user_id: session.id,
          received_at: new Date(),
          updated_at: new Date(),
        },
      });
    });

    revalidatePath('/inventory/transfers');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function listCountSessions() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const rows = await db.stock_count_sessions.findMany({
      include: {
        stores: { select: { name: true } },
        _count: { select: { stock_count_lines: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 30,
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createCountSession(store_id: number) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    const sessionNumber = await nextDocNumber(db, 'CNT', 'stock_count_sessions', 'session_number');
    const stocks = await db.store_stocks.findMany({ where: { store_id } });

    const countSession = await db.$transaction(async (tx: any) => {
      const sess = await tx.stock_count_sessions.create({
        data: {
          session_number: sessionNumber,
          store_id,
          status: 'Frozen',
          frozen_at: new Date(),
          organizationId,
          updated_at: new Date(),
        },
      });

      for (const s of stocks) {
        await tx.stock_count_lines.create({
          data: {
            session_id: sess.id,
            item_id: s.item_id,
            batch_id: s.batch_id,
            book_qty: s.quantity_on_hand,
            counted_qty: 0,
          },
        });
      }
      return sess;
    });

    revalidatePath('/inventory/counts');
    return { success: true, data: countSession };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getCountSession(id: number) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const row = await db.stock_count_sessions.findFirst({
      where: { id },
      include: {
        stores: true,
        stock_count_lines: {
          include: {
            item_master: { select: { item_code: true, name: true } },
            item_batches: { select: { batch_no: true } },
          },
        },
      },
    });
    if (!row) return { success: false, error: 'Session not found' };
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function submitCountLines(
  sessionId: number,
  lines: Array<{ line_id: number; counted_qty: number }>,
) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    await db.$transaction(async (tx: any) => {
      for (const line of lines) {
        const existing = await tx.stock_count_lines.findFirst({ where: { id: line.line_id, session_id: sessionId } });
        if (!existing) continue;
        const item = await tx.item_master.findFirst({ where: { id: existing.item_id } });
        const unitCost = item?.std_purchase_price || 0;
        await tx.stock_count_lines.update({
          where: { id: line.line_id },
          data: {
            counted_qty: line.counted_qty,
            variance_value: (line.counted_qty - existing.book_qty) * unitCost,
          },
        });
      }
      await tx.stock_count_sessions.update({
        where: { id: sessionId },
        data: { status: 'Review', updated_at: new Date() },
      });
    });
    revalidatePath('/inventory/counts');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function approveCountSession(sessionId: number) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_FINANCE_ROLES]);
    const countSession = await db.stock_count_sessions.findFirst({
      where: { id: sessionId },
      include: { stock_count_lines: true, stores: true },
    });
    if (!countSession) return { success: false, error: 'Session not found' };

    const adjNumber = await nextDocNumber(db, 'ADJ', 'stock_adjustments', 'adjustment_number');

    await db.$transaction(async (tx: any) => {
      const adjustment = await tx.stock_adjustments.create({
        data: {
          adjustment_number: adjNumber,
          store_id: countSession.store_id,
          count_session_id: sessionId,
          reason_code: 'COUNT_VARIANCE',
          status: 'Posted',
          approved_by: session.username,
          approved_at: new Date(),
          organizationId,
          updated_at: new Date(),
        },
      });

      for (const line of countSession.stock_count_lines) {
        const variance = line.counted_qty - line.book_qty;
        if (variance === 0) continue;

        const item = await tx.item_master.findFirst({ where: { id: line.item_id } });
        const unitCost = item?.std_purchase_price || 0;

        const stock = await upsertStoreStock(
          tx,
          organizationId,
          countSession.store_id,
          line.item_id,
          line.batch_id,
          variance,
          unitCost,
        );

        await recordMovement(tx, {
          organizationId,
          store_id: countSession.store_id,
          item_id: line.item_id,
          batch_id: line.batch_id,
          movement_type: variance > 0 ? 'ADJUSTMENT_PLUS' : 'ADJUSTMENT_MINUS',
          quantity_in: variance > 0 ? variance : 0,
          quantity_out: variance < 0 ? Math.abs(variance) : 0,
          unit_cost: unitCost,
          balance_after: stock.quantity_on_hand,
          source_type: 'COUNT',
          source_id: String(adjustment.id),
          user_id: session.id,
          reason: 'COUNT_VARIANCE',
        });
      }

      await tx.stock_count_sessions.update({
        where: { id: sessionId },
        data: { status: 'Posted', approved_by: session.username, approved_at: new Date(), updated_at: new Date() },
      });
    });

    revalidatePath('/inventory/counts');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getInventoryAnalytics() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const movements = await db.inventory_movements.findMany({
      where: {
        movement_type: { in: ['ISSUE', 'INDENT_ISSUE', 'CONSUMPTION'] },
        created_at: { gte: new Date(Date.now() - 365 * 86400000) },
      },
      select: { item_id: true, value: true },
    });

    const consumptionMap = new Map<number, number>();
    for (const m of movements) {
      consumptionMap.set(m.item_id, (consumptionMap.get(m.item_id) || 0) + Math.abs(m.value));
    }

    const sorted = [...consumptionMap.entries()].sort((a, b) => b[1] - a[1]);
    const totalConsumption = sorted.reduce((s, [, v]) => s + v, 0);
    let cumulative = 0;
    const abcUpdates: Array<{ id: number; abc_class: string }> = [];

    for (const [itemId, value] of sorted) {
      cumulative += value;
      const pct = totalConsumption > 0 ? cumulative / totalConsumption : 0;
      const abc = pct <= 0.7 ? 'A' : pct <= 0.9 ? 'B' : 'C';
      abcUpdates.push({ id: itemId, abc_class: abc });
    }

    for (const u of abcUpdates.slice(0, 100)) {
      await db.item_master.update({ where: { id: u.id }, data: { abc_class: u.abc_class } });
    }

    const items = await db.item_master.findMany({
      where: { status: 'Active' },
      select: { id: true, item_code: true, name: true, abc_class: true, ved_class: true },
    });

    return {
      success: true,
      data: {
        abcSummary: {
          A: items.filter((i: { abc_class: string | null }) => i.abc_class === 'A').length,
          B: items.filter((i: { abc_class: string | null }) => i.abc_class === 'B').length,
          C: items.filter((i: { abc_class: string | null }) => i.abc_class === 'C').length,
          unclassified: items.filter((i: { abc_class: string | null }) => !i.abc_class).length,
        },
        vedSummary: {
          V: items.filter((i: { ved_class: string | null }) => i.ved_class === 'V').length,
          E: items.filter((i: { ved_class: string | null }) => i.ved_class === 'E').length,
          D: items.filter((i: { ved_class: string | null }) => i.ved_class === 'D').length,
        },
        totalConsumption: Math.round(totalConsumption),
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
