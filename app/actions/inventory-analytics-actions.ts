'use server';

import { prisma } from '@/backend/db';
import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { INVENTORY_VIEW_ROLES } from '@/app/lib/inventory-roles';
import { nextDocNumber } from '@/app/lib/inventory-utils';

export async function computeAvailableStock(
  db: any,
  storeId: number,
  itemId: number,
): Promise<number> {
  const stocks = await db.store_stocks.findMany({
    where: { store_id: storeId, item_id: itemId },
    include: { item_batches: true },
  });

  let onHand = 0;
  let quarantined = 0;
  for (const s of stocks) {
    onHand += s.quantity_on_hand;
    if (s.item_batches?.is_quarantined) quarantined += s.quantity_on_hand;
  }

  const inTransitRows = await db.stock_transfer_items.findMany({
    where: {
      item_id: itemId,
      stock_transfers: { to_store_id: storeId, status: 'In Transit' },
    },
    select: { quantity: true },
  });
  const inTransitQty = inTransitRows.reduce((s: number, r: any) => s + r.quantity, 0);

  const openIndentItems = await db.indent_items.findMany({
    where: {
      item_id: itemId,
      indents: {
        from_store_id: storeId,
        status: { in: ['Submitted', 'Approved', 'Partially Issued'] },
      },
    },
    select: { qty_requested: true, qty_issued: true },
  });
  const indentSupply = openIndentItems.reduce(
    (s: number, r: any) => s + (r.qty_requested - r.qty_issued),
    0,
  );

  const openPOItems = await db.purchase_order_items.findMany({
    where: {
      itemMasterId: itemId,
      purchase_order: {
        storeId: storeId,
        status: { in: ['Approved', 'Submitted', 'Partially Received'] },
      },
    },
    select: { quantity_ordered: true, quantity_received: true },
  });
  const poSupply = openPOItems.reduce(
    (s: number, r: any) => s + (r.quantity_ordered - r.quantity_received),
    0,
  );

  return onHand - quarantined + inTransitQty + indentSupply + poSupply;
}

export async function runReorderEngineForOrg(organizationId: string) {
  const db = prisma;
  const config = await db.moduleConfig.findFirst({
    where: { organizationId, module_key: 'inventory' },
  });
  const settings = (config?.config_json as Record<string, unknown>) || {};
  if (!settings.auto_indent_enabled && !settings.auto_pr_enabled) {
    return { indentDrafts: 0, prDrafts: 0 };
  }

  const settings_rows = await db.store_item_settings.findMany({
    where: { organizationId },
    include: {
      stores: true,
      item_master: { select: { id: true, name: true, reorder_point: true, min_level: true } },
    },
  });

  let indentDrafts = 0;
  let prDrafts = 0;

  for (const row of settings_rows) {
    const reorderPoint = row.reorder_point || row.item_master.reorder_point || 0;
    if (reorderPoint <= 0) continue;

    const available = await computeAvailableStock(db, row.store_id, row.item_id);
    if (available > reorderPoint) continue;

    const qtyNeeded = (row.max_level || row.par_level || reorderPoint * 2) - available;
    if (qtyNeeded <= 0) continue;

    const store = row.stores;
    if (!store) continue;

    if (store.store_type !== 'CENTRAL' && store.parent_store_id && settings.auto_indent_enabled) {
      const existing = await db.indents.findFirst({
        where: {
          organizationId,
          from_store_id: row.store_id,
          to_store_id: store.parent_store_id,
          status: 'Draft',
        },
      });
      if (!existing) {
        const indentNumber = await nextDocNumber(db, 'IND', 'indents', 'indent_number');
        await db.indents.create({
          data: {
            indent_number: indentNumber,
            from_store_id: row.store_id,
            to_store_id: store.parent_store_id,
            cost_center: store.cost_center,
            priority: 'NORMAL',
            status: 'Draft',
            organizationId,
            updated_at: new Date(),
            indent_items: {
              create: [{ item_id: row.item_id, qty_requested: qtyNeeded, qty_approved: qtyNeeded }],
            },
          },
        });
        indentDrafts++;
      }
    } else if (store.store_type === 'CENTRAL' && settings.auto_pr_enabled) {
      const existing = await db.purchase_requisitions.findFirst({
        where: {
          organizationId,
          requesting_store_id: row.store_id,
          status: 'Draft',
        },
      });
      if (!existing) {
        const prNumber = await nextDocNumber(db, 'PR', 'purchase_requisitions', 'pr_number');
        await db.purchase_requisitions.create({
          data: {
            pr_number: prNumber,
            requesting_store_id: row.store_id,
            status: 'Draft',
            priority: 'NORMAL',
            organizationId,
            updated_at: new Date(),
            purchase_requisition_items: {
              create: [{ item_id: row.item_id, quantity: qtyNeeded }],
            },
          },
        });
        prDrafts++;
      }
    }
  }

  return { indentDrafts, prDrafts };
}

export async function runReorderEngine() {
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    const results: any[] = [];
    for (const org of orgs) {
      const r = await runReorderEngineForOrg(org.id);
      results.push({ organizationId: org.id, ...r });
    }
    revalidatePath('/inventory/dashboard');
    return { success: true, data: results };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function runExpiryAlertsForOrg(organizationId: string) {
  const config = await prisma.moduleConfig.findFirst({
    where: { organizationId, module_key: 'inventory' },
  });
  const alertDays = (config?.config_json as any)?.expiry_alert_days || [90, 60, 30];
  let alerts = 0;

  for (const days of alertDays) {
    const cutoff = new Date(Date.now() + days * 86400000);
    const batches = await prisma.item_batches.findMany({
      where: {
        organizationId,
        is_quarantined: false,
        expiry_date: { lte: cutoff, gte: new Date() },
      },
      include: { item_master: { select: { name: true, ved_class: true } } },
      take: 100,
    });

    for (const b of batches) {
      const storeManagers = await prisma.user.findMany({
        where: { organizationId, role: { in: ['store_manager', 'admin'] }, is_active: true },
        take: 5,
      });
      for (const u of storeManagers) {
        await prisma.notification.create({
          data: {
            user_id: u.id,
            title: `Expiry in ${days} days`,
            body: `${b.item_master.name} batch ${b.batch_no} expires ${b.expiry_date?.toLocaleDateString('en-IN')}`,
            type: b.item_master.ved_class === 'V' ? 'critical' : 'warning',
            link: '/inventory/stock',
            organizationId,
          },
        }).catch(() => {});
        alerts++;
      }
    }
  }
  return alerts;
}

export async function runExpiryAlerts() {
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    let total = 0;
    for (const org of orgs) {
      total += await runExpiryAlertsForOrg(org.id);
    }
    return { success: true, data: { alertsSent: total } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function scheduleCycleCountsForOrg(organizationId: string) {
  const config = await prisma.moduleConfig.findFirst({
    where: { organizationId, module_key: 'inventory' },
  });
  const abcSchedule = (config?.config_json as any)?.cycle_count_abc || {
    A: 'monthly',
    B: 'quarterly',
    C: 'half_yearly',
  };

  const now = new Date();
  const month = now.getMonth();
  const classes: string[] = ['A'];
  if (month % 3 === 0) classes.push('B');
  if (month % 6 === 0) classes.push('C');

  const stores = await prisma.stores.findMany({
    where: { organizationId, is_active: true },
    select: { id: true, name: true },
  });

  let created = 0;
  for (const store of stores) {
    const items = await prisma.item_master.findMany({
      where: { organizationId, status: 'Active', abc_class: { in: classes } },
      select: { id: true },
    });
    if (!items.length) continue;

    const existing = await prisma.stock_count_sessions.findFirst({
      where: {
        organizationId,
        store_id: store.id,
        status: { in: ['Draft', 'Frozen', 'Counting', 'Review'] },
        created_at: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
      },
    });
    if (existing) continue;

    const sessionNumber = await nextDocNumber(prisma, 'CNT', 'stock_count_sessions', 'session_number');
    const stocks = await prisma.store_stocks.findMany({
      where: { store_id: store.id, item_id: { in: items.map((i) => i.id) } },
    });

    await prisma.$transaction(async (tx) => {
      const sess = await tx.stock_count_sessions.create({
        data: {
          session_number: sessionNumber,
          store_id: store.id,
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
    });
    created++;
  }
  return created;
}

export async function getExpiryRegister(days = 90) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const cutoff = new Date(Date.now() + days * 86400000);
    const rows = await db.item_batches.findMany({
      where: { expiry_date: { lte: cutoff, gte: new Date() }, is_quarantined: false },
      include: {
        item_master: { select: { item_code: true, name: true, ved_class: true } },
      },
      orderBy: { expiry_date: 'asc' },
      take: 200,
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getStockAging(daysThreshold = 90) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const cutoff = new Date(Date.now() - daysThreshold * 86400000);
    const movements = await db.inventory_movements.findMany({
      where: {
        movement_type: { in: ['ISSUE', 'INDENT_ISSUE', 'CONSUMPTION', 'PATIENT_CHARGE'] },
        created_at: { gte: cutoff },
      },
      select: { item_id: true },
      distinct: ['item_id'],
    });
    const activeIds = new Set(movements.map((m: any) => m.item_id));

    const stocks = await db.store_stocks.findMany({
      where: { quantity_on_hand: { gt: 0 } },
      include: {
        item_master: { select: { item_code: true, name: true, abc_class: true } },
        stores: { select: { name: true } },
      },
    });

    const slow = stocks.filter((s: any) => !activeIds.has(s.item_id));
    return { success: true, data: slow };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getVendorPerformance() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const grns = await db.goodsReceiptNote.findMany({
      where: { vendor_id: { not: null } },
      include: {
        vendor: { select: { id: true, vendor_name: true } },
        goods_receipt_note_items: true,
      },
      orderBy: { received_at: 'desc' },
      take: 500,
    });

    const vendorMap: Record<number, {
      vendor_name: string;
      grn_count: number;
      total_value: number;
      rejected_qty: number;
      accepted_qty: number;
    }> = {};

    for (const g of grns) {
      if (!g.vendor_id || !g.vendor) continue;
      if (!vendorMap[g.vendor_id]) {
        vendorMap[g.vendor_id] = {
          vendor_name: g.vendor.vendor_name,
          grn_count: 0,
          total_value: 0,
          rejected_qty: 0,
          accepted_qty: 0,
        };
      }
      const v = vendorMap[g.vendor_id];
      v.grn_count++;
      v.total_value += g.total_amount;
      for (const line of g.goods_receipt_note_items) {
        v.accepted_qty += line.quantity_accepted;
        v.rejected_qty += line.quantity_rejected;
      }
    }

    const rows = Object.entries(vendorMap).map(([id, data]) => ({
      vendor_id: Number(id),
      ...data,
      fill_rate: data.accepted_qty + data.rejected_qty > 0
        ? Math.round((data.accepted_qty / (data.accepted_qty + data.rejected_qty)) * 100)
        : 100,
    }));

    return { success: true, data: rows.sort((a, b) => b.total_value - a.total_value) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getIndentFulfillmentSLA() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const indents = await db.indents.findMany({
      where: { status: { in: ['Issued', 'Closed'] } },
      select: { created_at: true, updated_at: true, indent_number: true, status: true },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    const rows = indents.map((i: any) => {
      const hours = (new Date(i.updated_at).getTime() - new Date(i.created_at).getTime()) / 3600000;
      return { ...i, fulfillment_hours: Math.round(hours * 10) / 10 };
    });

    const avg =
      rows.length > 0
        ? rows.reduce((s: number, r: any) => s + r.fulfillment_hours, 0) / rows.length
        : 0;

    return { success: true, data: { rows, avg_hours: Math.round(avg * 10) / 10 } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function computeSuggestedROP(itemId: number, storeId?: number) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const since = new Date(Date.now() - 90 * 86400000);
    const movements = await db.inventory_movements.findMany({
      where: {
        item_id: itemId,
        ...(storeId ? { store_id: storeId } : {}),
        movement_type: { in: ['CONSUMPTION', 'ISSUE', 'INDENT_ISSUE', 'PATIENT_CHARGE'] },
        created_at: { gte: since },
      },
      select: { quantity_out: true },
    });

    const totalOut = movements.reduce((s: number, m: any) => s + m.quantity_out, 0);
    const avgDaily = totalOut / 90;
    const item = await db.item_master.findFirst({ where: { id: itemId } });
    const leadTime = item?.lead_time_days || 7;
    const safetyStock = Math.ceil(avgDaily * 3);
    const suggestedROP = Math.ceil(avgDaily * leadTime + safetyStock);

    return {
      success: true,
      data: {
        avg_daily_consumption: Math.round(avgDaily * 100) / 100,
        lead_time_days: leadTime,
        safety_stock: safetyStock,
        suggested_reorder_point: suggestedROP,
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getABCVEDMatrix() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const items = await db.item_master.findMany({
      where: { status: 'Active' },
      select: { id: true, item_code: true, name: true, abc_class: true, ved_class: true },
    });

    const matrix: Record<string, number> = {};
    for (const i of items) {
      const key = `${i.abc_class || 'U'}-${i.ved_class || 'U'}`;
      matrix[key] = (matrix[key] || 0) + 1;
    }

    return { success: true, data: { items, matrix } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function lookupBarcode(code: string) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const trimmed = code.trim();

    let item = await db.item_master.findFirst({
      where: {
        OR: [
          { barcode: trimmed },
          { item_code: trimmed },
        ],
      },
      include: { item_categories: true },
    });

    if (!item) {
      const batch = await db.item_batches.findFirst({
        where: { batch_no: trimmed },
        include: {
          item_master: { include: { item_categories: true } },
          store_stocks: { include: { stores: true } },
        },
      });
      if (batch) {
        return {
          success: true,
          data: {
            type: 'batch',
            batch,
            item: batch.item_master,
            stocks: batch.store_stocks,
          },
        };
      }
      return { success: false, error: 'Not found' };
    }

    const stocks = await db.store_stocks.findMany({
      where: { item_id: item.id, quantity_on_hand: { gt: 0 } },
      include: { stores: true, item_batches: true },
    });

    return { success: true, data: { type: 'item', item, stocks } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
