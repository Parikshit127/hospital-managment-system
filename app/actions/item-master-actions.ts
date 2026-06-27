'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAuditEvent } from '@/app/actions/audit-actions';
import {
  INVENTORY_ADMIN_ROLES,
  INVENTORY_VIEW_ROLES,
  ITEM_TYPES,
} from '@/app/lib/inventory-roles';
import { itemCodePrefix } from '@/app/lib/inventory-utils';

const REVALIDATE = ['/inventory/items', '/inventory/dashboard', '/admin/inventory'];

function revalidateInventory() {
  REVALIDATE.forEach((p) => revalidatePath(p));
}

export async function listItemCategories() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const rows = await db.item_categories.findMany({
      orderBy: { name: 'asc' },
      include: { item_categories: { select: { id: true, name: true } } },
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createItemCategory(data: {
  name: string;
  item_type: string;
  parent_id?: number;
  default_gst_rate?: number;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    const row = await db.item_categories.create({
      data: {
        name: data.name.trim(),
        item_type: data.item_type,
        parent_id: data.parent_id || null,
        default_gst_rate: data.default_gst_rate ?? 0,
        organizationId,
        updated_at: new Date(),
      },
    });
    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'CREATE',
      module: 'inventory',
      entityType: 'item_category',
      entityId: String(row.id),
      details: `Created category ${row.name}`,
    });
    revalidateInventory();
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function listItems(params?: {
  query?: string;
  category_id?: number;
  status?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const where: any = {};
    if (params?.category_id) where.category_id = params.category_id;
    if (params?.status) where.status = params.status;
    if (params?.query?.trim()) {
      const q = params.query.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { item_code: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      db.item_master.findMany({
        where,
        include: {
          item_categories: { select: { id: true, name: true, item_type: true } },
          store_stocks: { select: { quantity_on_hand: true } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.item_master.count({ where }),
    ]);
    const enriched = rows.map((r: any) => ({
      ...r,
      total_stock: r.store_stocks?.reduce((s: number, x: any) => s + x.quantity_on_hand, 0) ?? 0,
    }));
    return { success: true, data: enriched, pagination: { page, limit, total } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function searchItems(query: string, limit = 20) {
  return listItems({ query, limit, status: 'Active' });
}

export async function getItem(id: number) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const row = await db.item_master.findFirst({
      where: { id },
      include: {
        item_categories: true,
        item_vendors: { include: { vendors: { select: { id: true, vendor_name: true } } } },
        store_stocks: {
          include: {
            stores: { select: { id: true, name: true, store_code: true } },
            item_batches: true,
          },
        },
      },
    });
    if (!row) return { success: false, error: 'Item not found' };
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function generateItemCode(db: any, itemType: string, organizationId: string) {
  const prefix = itemCodePrefix(itemType);
  const latest = await db.item_master.findFirst({
    where: { organizationId, item_code: { startsWith: prefix } },
    orderBy: { id: 'desc' },
    select: { item_code: true },
  });
  const seq = latest?.item_code ? parseInt(latest.item_code.replace(prefix, ''), 10) || 0 : 0;
  return `${prefix}${String(seq + 1).padStart(5, '0')}`;
}

export async function createItem(data: {
  name: string;
  description?: string;
  category_id: number;
  item_type?: string;
  base_uom: string;
  purchase_uom?: string;
  uom_conversion?: number;
  hsn_sac_code?: string;
  gst_rate?: number;
  std_purchase_price?: number;
  selling_price?: number;
  mrp?: number;
  is_batch_tracked?: boolean;
  is_expiry_tracked?: boolean;
  is_patient_chargeable?: boolean;
  is_returnable?: boolean;
  is_cold_chain?: boolean;
  min_level?: number;
  max_level?: number;
  reorder_point?: number;
  lead_time_days?: number;
  ved_class?: string;
  barcode?: string;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([
      'admin',
      'store_manager',
      'procurement_officer',
    ]);
    const category = await db.item_categories.findFirst({ where: { id: data.category_id } });
    if (!category) return { success: false, error: 'Category not found' };

    const itemType = data.item_type || category.item_type;
    if (!ITEM_TYPES.includes(itemType as any)) {
      return { success: false, error: 'Invalid item type' };
    }

    const status = session.role === 'admin' ? 'Active' : 'Draft';
    const item_code = await generateItemCode(db, itemType, organizationId);

    const row = await db.item_master.create({
      data: {
        item_code,
        name: data.name.trim(),
        description: data.description,
        category_id: data.category_id,
        item_type: itemType,
        base_uom: data.base_uom,
        purchase_uom: data.purchase_uom || data.base_uom,
        uom_conversion: data.uom_conversion ?? 1,
        hsn_sac_code: data.hsn_sac_code,
        gst_rate: data.gst_rate ?? category.default_gst_rate ?? 0,
        std_purchase_price: data.std_purchase_price ?? 0,
        selling_price: data.selling_price ?? 0,
        mrp: data.mrp ?? 0,
        is_batch_tracked: data.is_batch_tracked ?? false,
        is_expiry_tracked: data.is_expiry_tracked ?? false,
        is_patient_chargeable: data.is_patient_chargeable ?? false,
        is_returnable: data.is_returnable ?? true,
        is_cold_chain: data.is_cold_chain ?? false,
        min_level: data.min_level ?? 0,
        max_level: data.max_level ?? 0,
        reorder_point: data.reorder_point ?? 0,
        lead_time_days: data.lead_time_days ?? 0,
        ved_class: data.ved_class,
        barcode: data.barcode,
        status,
        organizationId,
        updated_at: new Date(),
      },
    });

    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'CREATE',
      module: 'inventory',
      entityType: 'item_master',
      entityId: String(row.id),
      details: `Created item ${row.item_code} - ${row.name}`,
    });
    revalidateInventory();
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateItem(
  id: number,
  data: Partial<{
    name: string;
    description: string;
    gst_rate: number;
    std_purchase_price: number;
    selling_price: number;
    mrp: number;
    min_level: number;
    max_level: number;
    reorder_point: number;
    lead_time_days: number;
    abc_class: string;
    ved_class: string;
    barcode: string;
    status: string;
  }>,
) {
  try {
    const { db, session } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    const existing = await db.item_master.findFirst({ where: { id } });
    if (!existing) return { success: false, error: 'Item not found' };

    const priceFields = ['std_purchase_price', 'selling_price', 'mrp'] as const;
    const updateData: any = { updated_at: new Date() };
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) updateData[k] = v;
    }

    if (session.role !== 'admin') {
      for (const f of priceFields) {
        if (data[f] !== undefined && data[f] !== (existing as any)[f]) {
          updateData[`pending_${f}`] = data[f];
          delete updateData[f];
        }
      }
    }

    const row = await db.item_master.update({ where: { id }, data: updateData });
    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'UPDATE',
      module: 'inventory',
      entityType: 'item_master',
      entityId: String(id),
      details: `Updated item ${existing.item_code}`,
    });
    revalidateInventory();
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function approveItem(id: number) {
  try {
    const { db, session } = await requireRoleAndTenant(['admin']);
    const existing = await db.item_master.findFirst({ where: { id } });
    if (!existing) return { success: false, error: 'Item not found' };

    const updateData: any = {
      status: 'Active',
      updated_at: new Date(),
    };
    if (existing.pending_std_purchase_price != null) {
      updateData.std_purchase_price = existing.pending_std_purchase_price;
      updateData.pending_std_purchase_price = null;
    }
    if (existing.pending_selling_price != null) {
      updateData.selling_price = existing.pending_selling_price;
      updateData.pending_selling_price = null;
    }
    if (existing.pending_mrp != null) {
      updateData.mrp = existing.pending_mrp;
      updateData.pending_mrp = null;
    }
    if (existing.status === 'Draft') {
      updateData.status = 'Active';
    }

    const row = await db.item_master.update({ where: { id }, data: updateData });
    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'APPROVE',
      module: 'inventory',
      entityType: 'item_master',
      entityId: String(id),
      details: `Approved item ${existing.item_code}`,
    });
    revalidateInventory();
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getItemMasterStats() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const [total, active, draft, items, stocks] = await Promise.all([
      db.item_master.count(),
      db.item_master.count({ where: { status: 'Active' } }),
      db.item_master.count({ where: { status: 'Draft' } }),
      db.item_master.findMany({
        where: { status: 'Active', reorder_point: { gt: 0 } },
        select: { id: true, reorder_point: true },
      }),
      db.store_stocks.findMany({ select: { item_id: true, quantity_on_hand: true } }),
    ]);
    const stockMap = new Map<number, number>();
    for (const s of stocks) {
      stockMap.set(s.item_id, (stockMap.get(s.item_id) || 0) + s.quantity_on_hand);
    }
    const lowStock = items.filter((i: { id: number; reorder_point: number }) => (stockMap.get(i.id) || 0) <= i.reorder_point).length;
    return { success: true, data: { total, active, draft, lowStock } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function importItemsFromRows(
  rows: Array<{
    name: string;
    category_name: string;
    item_type?: string;
    base_uom?: string;
    std_purchase_price?: number;
    reorder_point?: number;
    hsn_sac_code?: string;
    gst_rate?: number;
    is_batch_tracked?: boolean;
    ved_class?: string;
  }>,
  dryRun = false,
) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    const errors: string[] = [];
    const created: string[] = [];
    const duplicates: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 2;
      if (!row.name?.trim()) {
        errors.push(`Row ${line}: name required`);
        continue;
      }

      const dup = await db.item_master.findFirst({
        where: { name: { equals: row.name.trim(), mode: 'insensitive' }, organizationId },
      });
      if (dup) {
        duplicates.push(row.name);
        continue;
      }

      let category = await db.item_categories.findFirst({
        where: { name: { equals: row.category_name?.trim() || 'General Consumables', mode: 'insensitive' } },
      });
      if (!category) {
        if (dryRun) {
          errors.push(`Row ${line}: category "${row.category_name}" not found`);
          continue;
        }
        category = await db.item_categories.create({
          data: {
            name: row.category_name || 'General Consumables',
            item_type: row.item_type || 'CONSUMABLE',
            organizationId,
            updated_at: new Date(),
          },
        });
      }

      if (dryRun) {
        created.push(row.name);
        continue;
      }

      const itemType = row.item_type || category.item_type;
      const item_code = await (async () => {
        const prefix = itemCodePrefix(itemType);
        const latest = await db.item_master.findFirst({
          where: { organizationId, item_code: { startsWith: prefix } },
          orderBy: { id: 'desc' },
          select: { item_code: true },
        });
        const seq = latest?.item_code ? parseInt(latest.item_code.replace(prefix, ''), 10) || 0 : 0;
        return `${prefix}${String(seq + 1).padStart(5, '0')}`;
      })();

      await db.item_master.create({
        data: {
          item_code,
          name: row.name.trim(),
          category_id: category.id,
          item_type: itemType,
          base_uom: row.base_uom || 'Piece',
          purchase_uom: row.base_uom || 'Piece',
          hsn_sac_code: row.hsn_sac_code,
          gst_rate: row.gst_rate ?? category.default_gst_rate ?? 0,
          std_purchase_price: row.std_purchase_price ?? 0,
          reorder_point: row.reorder_point ?? 0,
          is_batch_tracked: row.is_batch_tracked ?? false,
          ved_class: row.ved_class,
          status: session.role === 'admin' ? 'Active' : 'Draft',
          organizationId,
          updated_at: new Date(),
        },
      });
      created.push(row.name);
    }

    if (!dryRun) revalidateInventory();
    return {
      success: true,
      data: { created: created.length, duplicates, errors, preview: dryRun ? created : undefined },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function importItemsFromXlsx(base64: string, dryRun = false) {
  const XLSX = await import('xlsx');
  const buffer = Buffer.from(base64, 'base64');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const rows = raw.map((r) => ({
    name: String(r.name || r.Name || r.ITEM_NAME || ''),
    category_name: String(r.category || r.Category || r.CATEGORY || 'General Consumables'),
    item_type: r.item_type ? String(r.item_type) : undefined,
    base_uom: r.base_uom ? String(r.base_uom) : undefined,
    std_purchase_price: Number(r.std_purchase_price || r.price || 0),
    reorder_point: Number(r.reorder_point || r.rop || 0),
    hsn_sac_code: r.hsn ? String(r.hsn) : undefined,
    gst_rate: Number(r.gst_rate || r.gst || 0),
    is_batch_tracked: Boolean(r.batch_tracked),
    ved_class: r.ved ? String(r.ved) : undefined,
  }));
  return importItemsFromRows(rows, dryRun);
}
