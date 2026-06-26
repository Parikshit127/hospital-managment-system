'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAuditEvent } from '@/app/actions/audit-actions';
import {
  INVENTORY_ADMIN_ROLES,
  INVENTORY_VIEW_ROLES,
  STORE_TYPES,
} from '@/app/lib/inventory-roles';

const REVALIDATE = ['/inventory/stores', '/inventory/dashboard', '/admin/inventory'];

function revalidateStores() {
  REVALIDATE.forEach((p) => revalidatePath(p));
}

export async function ensureDefaultStores() {
  try {
    const { db, organizationId } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    const count = await db.stores.count();
    if (count > 0) return { success: true, data: { created: 0 } };

    const catCount = await db.item_categories.count();
    if (catCount === 0) {
      const defaultCats = [
        { name: 'General Consumables', item_type: 'CONSUMABLE' },
        { name: 'IV Fluids & Fluids', item_type: 'CONSUMABLE' },
        { name: 'Surgical Supplies', item_type: 'CONSUMABLE' },
        { name: 'Lab Reagents', item_type: 'REAGENT' },
        { name: 'Linen & Textiles', item_type: 'LINEN' },
        { name: 'Stationery', item_type: 'STATIONERY' },
        { name: 'Maintenance Supplies', item_type: 'MAINTENANCE' },
      ];
      const now = new Date();
      for (const c of defaultCats) {
        await db.item_categories.create({
          data: { ...c, organizationId, default_gst_rate: 12, updated_at: now },
        });
      }
    }

    const branch = await db.branch.findFirst({ where: { organizationId } });
    const now = new Date();
    const defaults = [
      { store_code: 'CS-001', name: 'Central Store', store_type: 'CENTRAL', cost_center: 'CENTRAL' },
      { store_code: 'PH-001', name: 'Pharmacy Store', store_type: 'PHARMACY', cost_center: 'PHARMACY' },
      { store_code: 'OT-001', name: 'OT Store', store_type: 'OT', cost_center: 'OT' },
      { store_code: 'LAB-001', name: 'Lab Store', store_type: 'LAB', cost_center: 'LAB' },
      { store_code: 'ER-001', name: 'ER Store', store_type: 'ER', cost_center: 'ER' },
    ];

    let centralId: number | null = null;
    for (const s of defaults) {
      const row = await db.stores.create({
        data: {
          ...s,
          branch_id: branch?.id || null,
          organizationId,
          is_active: true,
          updated_at: now,
        },
      });
      if (s.store_type === 'CENTRAL') centralId = row.id;
    }

    if (centralId) {
      await db.stores.updateMany({
        where: { store_type: { not: 'CENTRAL' }, organizationId },
        data: { parent_store_id: centralId, updated_at: now },
      });
    }

    const wards = await db.wards.findMany({ select: { ward_id: true, ward_name: true } });
    for (const w of wards) {
      await db.stores.create({
        data: {
          store_code: `WRD-${w.ward_id}`,
          name: `${w.ward_name} Ward Store`,
          store_type: 'WARD',
          branch_id: branch?.id || null,
          parent_store_id: centralId,
          cost_center: `WARD-${w.ward_id}`,
          organizationId,
          is_active: true,
          updated_at: now,
        },
      });
    }

    revalidateStores();
    return { success: true, data: { created: defaults.length + wards.length } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function listStores(params?: { store_type?: string; active_only?: boolean }) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const where: any = {};
    if (params?.store_type) where.store_type = params.store_type;
    if (params?.active_only !== false) where.is_active = true;

    const rows = await db.stores.findMany({
      where,
      include: {
        stores: { select: { id: true, name: true, store_code: true } },
        branches: { select: { id: true, branch_name: true } },
        users: { select: { id: true, name: true, username: true } },
        _count: { select: { store_stocks: true } },
      },
      orderBy: [{ store_type: 'asc' }, { name: 'asc' }],
    });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getStore(id: number) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const row = await db.stores.findFirst({
      where: { id },
      include: {
        stores: true,
        other_stores: { select: { id: true, name: true, store_code: true } },
        store_item_settings: {
          include: { item_master: { select: { id: true, item_code: true, name: true } } },
        },
      },
    });
    if (!row) return { success: false, error: 'Store not found' };
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createStore(data: {
  store_code: string;
  name: string;
  store_type: string;
  branch_id?: string;
  parent_store_id?: number;
  cost_center?: string;
  incharge_user_id?: string;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant(['admin']);
    if (!STORE_TYPES.includes(data.store_type as any)) {
      return { success: false, error: 'Invalid store type' };
    }
    const row = await db.stores.create({
      data: {
        store_code: data.store_code.trim().toUpperCase(),
        name: data.name.trim(),
        store_type: data.store_type,
        branch_id: data.branch_id || null,
        parent_store_id: data.parent_store_id || null,
        cost_center: data.cost_center || data.store_type,
        incharge_user_id: data.incharge_user_id || null,
        organizationId,
        is_active: true,
        updated_at: new Date(),
      },
    });
    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'CREATE',
      module: 'inventory',
      entityType: 'store',
      entityId: String(row.id),
      details: `Created store ${row.store_code}`,
    });
    revalidateStores();
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateStore(
  id: number,
  data: Partial<{
    name: string;
    parent_store_id: number;
    cost_center: string;
    incharge_user_id: string;
    is_active: boolean;
  }>,
) {
  try {
    const { db, session } = await requireRoleAndTenant(['admin', 'store_manager']);
    const row = await db.stores.update({
      where: { id },
      data: { ...data, updated_at: new Date() },
    });
    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'UPDATE',
      module: 'inventory',
      entityType: 'store',
      entityId: String(id),
      details: `Updated store ${row.store_code}`,
    });
    revalidateStores();
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function upsertStoreItemSetting(data: {
  store_id: number;
  item_id: number;
  par_level?: number;
  reorder_point?: number;
  max_level?: number;
  auto_indent?: boolean;
}) {
  try {
    const { db, organizationId } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    const row = await db.store_item_settings.upsert({
      where: {
        store_id_item_id: { store_id: data.store_id, item_id: data.item_id },
      },
      create: {
        store_id: data.store_id,
        item_id: data.item_id,
        par_level: data.par_level ?? 0,
        reorder_point: data.reorder_point ?? 0,
        max_level: data.max_level ?? 0,
        auto_indent: data.auto_indent ?? false,
        organizationId,
        updated_at: new Date(),
      },
      update: {
        par_level: data.par_level,
        reorder_point: data.reorder_point,
        max_level: data.max_level,
        auto_indent: data.auto_indent,
        updated_at: new Date(),
      },
    });
    revalidatePath('/inventory/stores');
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getStoreUsers() {
  try {
    const { db } = await requireRoleAndTenant(['admin']);
    const users = await db.user.findMany({
      where: { role: { in: ['store_manager', 'admin', 'pharmacist'] } },
      select: { id: true, name: true, username: true, role: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, data: users };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
