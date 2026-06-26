'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAuditEvent } from '@/app/actions/audit-actions';
import {
  INVENTORY_INDENT_ROLES,
  INVENTORY_ISSUE_ROLES,
  INVENTORY_VIEW_ROLES,
} from '@/app/lib/inventory-roles';
import { calcMovingAverage, nextDocNumber } from '@/app/lib/inventory-utils';

function revalidateIndents() {
  ['/inventory/indents', '/inventory/dashboard', '/inventory/stock'].forEach((p) =>
    revalidatePath(p),
  );
}

export async function listIndents(params?: { status?: string; store_id?: number }) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const where: any = {};
    if (params?.status) where.status = params.status;
    if (params?.store_id) {
      where.OR = [{ from_store_id: params.store_id }, { to_store_id: params.store_id }];
    }
    const rows = await db.indents.findMany({
      where,
      include: {
        indent_items: {
          include: { item_master: { select: { item_code: true, name: true, base_uom: true } } },
        },
        stores_indents_from_store_idTostores: { select: { id: true, name: true, store_code: true } },
        stores_indents_to_store_idTostores: { select: { id: true, name: true, store_code: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createIndent(data: {
  from_store_id: number;
  to_store_id: number;
  cost_center?: string;
  priority?: string;
  patient_id?: string;
  admission_id?: string;
  lines: Array<{ item_id: number; qty_requested: number }>;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_INDENT_ROLES]);
    if (!data.lines?.length) return { success: false, error: 'Add at least one line' };

    const indentNumber = await nextDocNumber(db, 'IND', 'indents', 'indent_number');
    const indent = await db.indents.create({
      data: {
        indent_number: indentNumber,
        from_store_id: data.from_store_id,
        to_store_id: data.to_store_id,
        cost_center: data.cost_center,
        priority: data.priority || 'NORMAL',
        patient_id: data.patient_id,
        admission_id: data.admission_id,
        status: 'Draft',
        organizationId,
        updated_at: new Date(),
        indent_items: {
          create: data.lines.map((l) => ({
            item_id: l.item_id,
            qty_requested: l.qty_requested,
            qty_approved: l.qty_requested,
          })),
        },
      },
      include: { indent_items: true },
    });

    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'CREATE',
      module: 'inventory',
      entityType: 'indent',
      entityId: String(indent.id),
      details: `Created indent ${indentNumber}`,
    });
    revalidateIndents();
    return { success: true, data: indent };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateIndentStatus(id: number, status: string) {
  try {
    const { db, session } = await requireRoleAndTenant([...INVENTORY_INDENT_ROLES, ...INVENTORY_ISSUE_ROLES]);
    const update: any = { status, updated_at: new Date() };
    if (status === 'Approved') {
      update.approved_by = session.username;
      update.approved_at = new Date();
    }
    const indent = await db.indents.update({ where: { id }, data: update });
    revalidateIndents();
    return { success: true, data: indent };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function allocateFefo(tx: any, storeId: number, itemId: number, qty: number) {
  const stocks = await tx.store_stocks.findMany({
    where: { store_id: storeId, item_id: itemId, quantity_on_hand: { gt: 0 } },
    include: { item_batches: true },
    orderBy: { item_batches: { expiry_date: 'asc' } },
  });

  const allocations: Array<{ batch_id: number | null; quantity: number; unit_cost: number }> = [];
  let remaining = qty;
  for (const s of stocks) {
    if (remaining <= 0) break;
    if (s.item_batches?.is_quarantined) continue;
    const take = Math.min(s.quantity_on_hand - s.quantity_reserved, remaining);
    if (take <= 0) continue;
    allocations.push({ batch_id: s.batch_id, quantity: take, unit_cost: s.avg_unit_cost });
    remaining -= take;
  }
  if (remaining > 0) throw new Error(`Short stock: ${remaining} units unavailable`);
  return allocations;
}

export async function issueIndent(indentId: number) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_ISSUE_ROLES]);
    const indent = await db.indents.findFirst({
      where: { id: indentId },
      include: { indent_items: true },
    });
    if (!indent) return { success: false, error: 'Indent not found' };
    if (!['Approved', 'Partially Issued'].includes(indent.status)) {
      return { success: false, error: 'Indent must be approved before issue' };
    }

    const issueNumber = await nextDocNumber(db, 'ISS', 'stock_issues', 'issue_number');

    await db.$transaction(async (tx: any) => {
      const issue = await tx.stock_issues.create({
        data: {
          issue_number: issueNumber,
          indent_id: indentId,
          from_store_id: indent.to_store_id,
          to_store_id: indent.from_store_id,
          cost_center: indent.cost_center,
          organizationId,
          updated_at: new Date(),
        },
      });

      for (const line of indent.indent_items) {
        const toIssue = line.qty_approved - line.qty_issued;
        if (toIssue <= 0) continue;

        const allocations = await allocateFefo(tx, indent.to_store_id, line.item_id, toIssue);

        for (const alloc of allocations) {
          const existing = await tx.store_stocks.findFirst({
            where: {
              store_id: indent.to_store_id,
              item_id: line.item_id,
              batch_id: alloc.batch_id,
            },
          });
          const newQty = (existing?.quantity_on_hand || 0) - alloc.quantity;
          if (newQty < 0) throw new Error('Insufficient stock');

          await tx.store_stocks.update({
            where: { id: existing!.id },
            data: { quantity_on_hand: newQty, updated_at: new Date() },
          });

          await tx.stock_issue_items.create({
            data: {
              issue_id: issue.id,
              item_id: line.item_id,
              batch_id: alloc.batch_id,
              quantity: alloc.quantity,
              unit_cost: alloc.unit_cost,
            },
          });

          await tx.inventory_movements.create({
            data: {
              organizationId,
              store_id: indent.to_store_id,
              item_id: line.item_id,
              batch_id: alloc.batch_id,
              movement_type: 'INDENT_ISSUE',
              quantity_in: 0,
              quantity_out: alloc.quantity,
              unit_cost: alloc.unit_cost,
              value: -alloc.quantity * alloc.unit_cost,
              balance_after: newQty,
              source_type: 'INDENT',
              source_id: String(indentId),
              cost_center: indent.cost_center,
              user_id: session.id,
              created_at: new Date(),
            },
          });

          const destStock = await tx.store_stocks.findFirst({
            where: {
              store_id: indent.from_store_id,
              item_id: line.item_id,
              batch_id: alloc.batch_id,
            },
          });
          const destQty = (destStock?.quantity_on_hand || 0) + alloc.quantity;
          const destAvg = destStock
            ? calcMovingAverage(destStock.quantity_on_hand, destStock.avg_unit_cost, alloc.quantity, alloc.unit_cost)
            : alloc.unit_cost;

          if (destStock) {
            await tx.store_stocks.update({
              where: { id: destStock.id },
              data: { quantity_on_hand: destQty, avg_unit_cost: destAvg, updated_at: new Date() },
            });
          } else {
            await tx.store_stocks.create({
              data: {
                store_id: indent.from_store_id,
                item_id: line.item_id,
                batch_id: alloc.batch_id,
                quantity_on_hand: alloc.quantity,
                quantity_reserved: 0,
                avg_unit_cost: alloc.unit_cost,
                organizationId,
                updated_at: new Date(),
              },
            });
          }

          await tx.inventory_movements.create({
            data: {
              organizationId,
              store_id: indent.from_store_id,
              item_id: line.item_id,
              batch_id: alloc.batch_id,
              movement_type: 'INDENT_RECEIPT',
              quantity_in: alloc.quantity,
              quantity_out: 0,
              unit_cost: alloc.unit_cost,
              value: alloc.quantity * alloc.unit_cost,
              balance_after: destQty,
              source_type: 'INDENT',
              source_id: String(indentId),
              cost_center: indent.cost_center,
              user_id: session.id,
              created_at: new Date(),
            },
          });
        }

        await tx.indent_items.update({
          where: { id: line.id },
          data: { qty_issued: line.qty_issued + toIssue },
        });
      }

      const updatedLines = await tx.indent_items.findMany({ where: { indent_id: indentId } });
      const allIssued = updatedLines.every((l: any) => l.qty_issued >= l.qty_approved);
      const partial = updatedLines.some((l: any) => l.qty_issued > 0);

      await tx.indents.update({
        where: { id: indentId },
        data: {
          status: allIssued ? 'Issued' : partial ? 'Partially Issued' : indent.status,
          updated_at: new Date(),
        },
      });
    });

    revalidateIndents();
    return { success: true, data: { issue_number: issueNumber } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function confirmIndentReceipt(indentId: number) {
  try {
    const { db, session } = await requireRoleAndTenant([...INVENTORY_INDENT_ROLES]);
    const indent = await db.indents.findFirst({
      where: { id: indentId },
      include: { indent_items: true },
    });
    if (!indent) return { success: false, error: 'Indent not found' };

    await db.$transaction(async (tx: any) => {
      for (const line of indent.indent_items) {
        await tx.indent_items.update({
          where: { id: line.id },
          data: { qty_received: line.qty_issued },
        });
      }
      await tx.indents.update({
        where: { id: indentId },
        data: { status: 'Closed', updated_at: new Date() },
      });
    });

    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'CONFIRM_RECEIPT',
      module: 'inventory',
      entityType: 'indent',
      entityId: String(indentId),
      details: `Confirmed receipt for indent ${indent.indent_number}`,
    });
    revalidateIndents();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function listVendors() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const rows = await db.vendor.findMany({
      where: { is_active: true },
      select: { id: true, vendor_name: true, vendor_code: true, gst_number: true },
      orderBy: { vendor_name: 'asc' },
      take: 100,
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
