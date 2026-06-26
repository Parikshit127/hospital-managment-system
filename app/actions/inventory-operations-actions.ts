'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import { revalidatePath } from 'next/cache';
import { logAuditEvent } from '@/app/actions/audit-actions';
import { postChargeToIpdBill } from '@/app/actions/ipd-finance-actions';
import {
  INVENTORY_ADMIN_ROLES,
  INVENTORY_FINANCE_ROLES,
  INVENTORY_INDENT_ROLES,
  INVENTORY_ISSUE_ROLES,
  INVENTORY_PROCUREMENT_ROLES,
  INVENTORY_VIEW_ROLES,
} from '@/app/lib/inventory-roles';
import { nextDocNumber } from '@/app/lib/inventory-utils';
import {
  allocateFefo,
  issueStockAllocations,
  receiveStock,
  recordMovement,
  upsertStoreStock,
} from '@/app/lib/inventory-stock-engine';
import {
  postConsumptionToGL,
  postGrnToGL,
  postOpeningStockToGL,
  postWriteOffToGL,
} from '@/app/actions/inventory-gl-actions';

function revalidateOps() {
  ['/inventory/stock', '/inventory/issues', '/inventory/dashboard', '/inventory/procurement'].forEach((p) =>
    revalidatePath(p),
  );
}

export async function recordConsumption(data: {
  store_id: number;
  item_id: number;
  quantity: number;
  admission_id?: string;
  patient_id?: string;
  cost_center?: string;
  chargeable?: boolean;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([
      ...INVENTORY_INDENT_ROLES,
      ...INVENTORY_ISSUE_ROLES,
    ]);

    const item = await db.item_master.findFirst({
      where: { id: data.item_id },
      include: { item_categories: true },
    });
    if (!item) return { success: false, error: 'Item not found' };

    const store = await db.stores.findFirst({ where: { id: data.store_id } });
    const isChargeable = data.chargeable ?? item.is_patient_chargeable;

    const movementIds: number[] = [];
    let totalCost = 0;

    await db.$transaction(async (tx: any) => {
      const allocations = await allocateFefo(tx, data.store_id, data.item_id, data.quantity);

      for (const alloc of allocations) {
        const stock = await upsertStoreStock(
          tx,
          organizationId,
          data.store_id,
          data.item_id,
          alloc.batch_id,
          -alloc.quantity,
          alloc.unit_cost,
        );
        totalCost += alloc.quantity * alloc.unit_cost;
        const mov = await recordMovement(tx, {
          organizationId,
          store_id: data.store_id,
          item_id: data.item_id,
          batch_id: alloc.batch_id,
          movement_type: isChargeable ? 'PATIENT_CHARGE' : 'CONSUMPTION',
          quantity_in: 0,
          quantity_out: alloc.quantity,
          unit_cost: alloc.unit_cost,
          balance_after: stock.quantity_on_hand,
          source_type: 'CONSUMPTION',
          cost_center: data.cost_center || store?.cost_center,
          patient_id: data.patient_id,
          admission_id: data.admission_id,
          user_id: session.id,
        });
        movementIds.push(mov.id);
      }
    });

    if (isChargeable && data.admission_id) {
      await postChargeToIpdBill({
        admission_id: data.admission_id,
        source_module: 'inventory',
        source_ref_id: String(movementIds[0]),
        description: item.name,
        quantity: data.quantity,
        unit_price: item.selling_price || item.mrp,
        tax_rate: item.gst_rate,
        hsn_sac_code: item.hsn_sac_code || undefined,
        posted_by: session.username,
      });
    }

    const glRes = await postConsumptionToGL({
      organizationId,
      itemId: data.item_id,
      categoryId: item.category_id,
      value: totalCost,
      costCenter: data.cost_center || store?.cost_center,
      movementIds,
      isPatientChargeable: isChargeable,
    });

    revalidateOps();
    return { success: true, data: { movementIds, totalCost, glPosted: glRes.success } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function directIssue(data: {
  from_store_id: number;
  to_store_id?: number;
  cost_center?: string;
  item_id: number;
  quantity: number;
  reason?: string;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_ISSUE_ROLES]);
    const issueNumber = await nextDocNumber(db, 'ISS', 'stock_issues', 'issue_number');

    await db.$transaction(async (tx: any) => {
      const issue = await tx.stock_issues.create({
        data: {
          issue_number: issueNumber,
          from_store_id: data.from_store_id,
          to_store_id: data.to_store_id || null,
          cost_center: data.cost_center,
          organizationId,
          updated_at: new Date(),
        },
      });

      const allocations = await allocateFefo(tx, data.from_store_id, data.item_id, data.quantity);
      await issueStockAllocations(tx, organizationId, data.from_store_id, data.item_id, allocations, 'ISSUE', {
        source_type: 'DIRECT_ISSUE',
        source_id: String(issue.id),
        cost_center: data.cost_center,
        user_id: session.id,
        reason: data.reason,
      });

      if (data.to_store_id) {
        for (const alloc of allocations) {
          await receiveStock(tx, organizationId, data.to_store_id, data.item_id, alloc.batch_id, alloc.quantity, alloc.unit_cost, 'RETURN_TO_STORE', {
            source_type: 'DIRECT_ISSUE',
            source_id: String(issue.id),
            user_id: session.id,
          });
        }
      }
    });

    revalidateOps();
    return { success: true, data: { issue_number: issueNumber } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function emergencyIssue(data: {
  from_store_id: number;
  item_id: number;
  quantity: number;
  admission_id?: string;
  cost_center?: string;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([
      ...INVENTORY_INDENT_ROLES,
      ...INVENTORY_ISSUE_ROLES,
    ]);

    const config = await db.moduleConfig.findFirst({ where: { module_key: 'inventory' } });
    const cap = (config?.config_json as any)?.emergency_issue_cap ?? 10000;

    const item = await db.item_master.findFirst({ where: { id: data.item_id } });
    const estValue = (item?.std_purchase_price || 0) * data.quantity;

    await db.$transaction(async (tx: any) => {
      const allocations = await allocateFefo(tx, data.from_store_id, data.item_id, data.quantity);
      await issueStockAllocations(tx, organizationId, data.from_store_id, data.item_id, allocations, 'ISSUE', {
        source_type: 'EMERGENCY',
        cost_center: data.cost_center,
        admission_id: data.admission_id,
        user_id: session.id,
        reason: estValue > cap ? 'RETRO_APPROVAL_REQUIRED' : 'EMERGENCY',
      });
    });

    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'EMERGENCY_ISSUE',
      module: 'inventory',
      details: `Emergency issue item ${data.item_id} qty ${data.quantity}`,
    });

    revalidateOps();
    return { success: true, data: { requiresRetroApproval: estValue > cap } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function quarantineBatch(batchId: number, reason: string) {
  try {
    const { db, session } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    await db.item_batches.update({
      where: { id: batchId },
      data: { is_quarantined: true, updated_at: new Date() },
    });
    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'QUARANTINE',
      module: 'inventory',
      entityType: 'batch',
      entityId: String(batchId),
      details: reason,
    });
    revalidatePath('/inventory/stock');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function releaseQuarantine(batchId: number) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    await db.item_batches.update({
      where: { id: batchId },
      data: { is_quarantined: false, updated_at: new Date() },
    });
    revalidatePath('/inventory/stock');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function writeOffBatch(data: {
  store_id: number;
  batch_id: number;
  quantity: number;
  reason_code: 'EXPIRY_WRITEOFF' | 'DAMAGE_WRITEOFF';
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_FINANCE_ROLES]);
    const batch = await db.item_batches.findFirst({
      where: { id: data.batch_id },
      include: { item_master: true },
    });
    if (!batch) return { success: false, error: 'Batch not found' };

    const movementIds: number[] = [];
    let totalValue = 0;

    await db.$transaction(async (tx: any) => {
      const stock = await upsertStoreStock(
        tx,
        organizationId,
        data.store_id,
        batch.item_id,
        data.batch_id,
        -data.quantity,
        batch.cost_price,
      );
      totalValue = data.quantity * batch.cost_price;
      const mov = await recordMovement(tx, {
        organizationId,
        store_id: data.store_id,
        item_id: batch.item_id,
        batch_id: data.batch_id,
        movement_type: data.reason_code,
        quantity_in: 0,
        quantity_out: data.quantity,
        unit_cost: batch.cost_price,
        balance_after: stock.quantity_on_hand,
        source_type: 'WRITEOFF',
        user_id: session.id,
        reason: data.reason_code,
      });
      movementIds.push(mov.id);
    });

    await postWriteOffToGL({
      organizationId,
      categoryId: batch.item_master.category_id,
      value: totalValue,
      movementIds,
      reason: data.reason_code,
    });

    revalidateOps();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createSupplierReturn(data: {
  store_id: number;
  item_id: number;
  batch_id?: number;
  quantity: number;
  vendor_id: number;
  reason: string;
  return_type?: string;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_PROCUREMENT_ROLES]);
    const stock = await db.store_stocks.findFirst({
      where: { store_id: data.store_id, item_id: data.item_id, batch_id: data.batch_id ?? null },
    });
    if (!stock || stock.quantity_on_hand < data.quantity) {
      return { success: false, error: 'Insufficient stock' };
    }

    const ret = await db.pharmacyReturn.create({
      data: {
        return_type: data.return_type || 'supplier_return',
        medicine_id: null,
        itemMasterId: data.item_id,
        storeId: data.store_id,
        batch_id: data.batch_id ? String(data.batch_id) : null,
        quantity: data.quantity,
        unit_cost: stock.avg_unit_cost,
        reason: data.reason,
        vendor_id: data.vendor_id,
        status: 'Pending',
        organizationId,
      },
    });

    await db.$transaction(async (tx: any) => {
      await upsertStoreStock(tx, organizationId, data.store_id, data.item_id, data.batch_id ?? null, -data.quantity, stock.avg_unit_cost);
      await recordMovement(tx, {
        organizationId,
        store_id: data.store_id,
        item_id: data.item_id,
        batch_id: data.batch_id ?? null,
        movement_type: 'SUPPLIER_RETURN',
        quantity_in: 0,
        quantity_out: data.quantity,
        unit_cost: stock.avg_unit_cost,
        balance_after: stock.quantity_on_hand - data.quantity,
        source_type: 'RETURN',
        source_id: String(ret.id),
        user_id: session.id,
        reason: data.reason,
      });
    });

    revalidatePath('/inventory/procurement');
    return { success: true, data: ret };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function recordOpeningStockWithGL(data: {
  store_id: number;
  lines: Array<{ item_id: number; quantity: number; unit_cost: number; batch_no?: string; expiry_date?: string }>;
}) {
  try {
    const { db, session, organizationId } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES, 'finance']);
    const store = await db.stores.findFirst({ where: { id: data.store_id } });
    if (!store) return { success: false, error: 'Store not found' };

    const movementIds: number[] = [];
    let totalValue = 0;

    await db.$transaction(async (tx: any) => {
      for (const line of data.lines) {
        const item = await tx.item_master.findFirst({ where: { id: line.item_id } });
        if (!item) throw new Error(`Item ${line.item_id} not found`);

        let batchId: number | null = null;
        if (item.is_batch_tracked) {
          const batch = await tx.item_batches.upsert({
            where: { item_id_batch_no: { item_id: line.item_id, batch_no: line.batch_no || 'OPENING' } },
            create: {
              item_id: line.item_id,
              batch_no: line.batch_no || 'OPENING',
              expiry_date: line.expiry_date ? new Date(line.expiry_date) : null,
              cost_price: line.unit_cost,
              organizationId,
              updated_at: new Date(),
            },
            update: { updated_at: new Date() },
          });
          batchId = batch.id;
        }

        const stock = await receiveStock(
          tx,
          organizationId,
          data.store_id,
          line.item_id,
          batchId,
          line.quantity,
          line.unit_cost,
          'OPENING',
          { source_type: 'OPENING', user_id: session.id, cost_center: store.cost_center },
        );
        totalValue += line.quantity * line.unit_cost;
        const lastMov = await tx.inventory_movements.findFirst({
          where: { store_id: data.store_id, item_id: line.item_id },
          orderBy: { id: 'desc' },
        });
        if (lastMov) movementIds.push(lastMov.id);
      }
    });

    await postOpeningStockToGL({
      organizationId,
      totalValue,
      storeName: store.name,
      movementIds,
    });

    revalidateOps();
    return { success: true, data: { totalValue } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Phase 3/4 — Kits/BOM
export async function createItemKit(kitItemId: number, components: Array<{ item_id: number; quantity: number }>) {
  try {
    const { db, organizationId } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    const kit = await db.item_kits.create({
      data: {
        kit_item_id: kitItemId,
        organizationId,
        updated_at: new Date(),
        item_kit_components: {
          create: components.map((c) => ({ component_item_id: c.item_id, quantity: c.quantity })),
        },
      },
      include: { item_kit_components: true },
    });
    return { success: true, data: kit };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function issueKit(data: {
  store_id: number;
  kit_item_id: number;
  quantity?: number;
  admission_id?: string;
  cost_center?: string;
}) {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_ISSUE_ROLES]);
    const kit = await db.item_kits.findFirst({
      where: { kit_item_id: data.kit_item_id },
      include: { item_kit_components: true },
    });
    if (!kit) return { success: false, error: 'Kit not configured' };

    const kitQty = data.quantity || 1;
    for (const comp of kit.item_kit_components) {
      const res = await recordConsumption({
        store_id: data.store_id,
        item_id: comp.component_item_id,
        quantity: comp.quantity * kitQty,
        admission_id: data.admission_id,
        cost_center: data.cost_center,
      });
      if (!res.success) return res;
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Phase 4 — CSSD instrument register (basic)
export async function listCssdInstruments() {
  try {
    const { db } = await requireRoleAndTenant([...INVENTORY_VIEW_ROLES]);
    const rows = await db.cssd_instruments.findMany({ orderBy: { name: 'asc' } });
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function registerCssdInstrument(data: {
  instrument_code: string;
  name: string;
  store_id?: number;
}) {
  try {
    const { db, organizationId } = await requireRoleAndTenant([...INVENTORY_ADMIN_ROLES]);
    const row = await db.cssd_instruments.create({
      data: {
        instrument_code: data.instrument_code.toUpperCase(),
        name: data.name,
        store_id: data.store_id || null,
        organizationId,
        updated_at: new Date(),
      },
    });
    return { success: true, data: row };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Legacy migration WardStock + LabReagent → StoreStock
export async function migrateLegacyInventory() {
  try {
    const { db, organizationId, session } = await requireRoleAndTenant(['admin']);
    let migrated = 0;

    const wardStocks = await db.wardStock.findMany({
      include: { ward: true, medicine: true },
    });

    for (const ws of wardStocks) {
      const wardStore = await db.stores.findFirst({
        where: { store_type: 'WARD', store_code: { contains: String(ws.ward_id) } },
      });
      if (!wardStore || ws.current_stock <= 0) continue;

      const item = await db.item_master.findFirst({
        where: { name: { equals: ws.medicine.brand_name, mode: 'insensitive' } },
      });
      if (!item) continue;

      await db.store_stocks.upsert({
        where: {
          store_id_item_id_batch_id: { store_id: wardStore.id, item_id: item.id, batch_id: null },
        },
        create: {
          store_id: wardStore.id,
          item_id: item.id,
          quantity_on_hand: ws.current_stock,
          avg_unit_cost: ws.medicine.purchase_price || 0,
          organizationId,
          updated_at: new Date(),
        },
        update: {
          quantity_on_hand: ws.current_stock,
          updated_at: new Date(),
        },
      });
      migrated++;
    }

    const reagents = await db.labReagentInventory.findMany();
    const labStore = await db.stores.findFirst({ where: { store_type: 'LAB' } });
    if (labStore) {
      for (const r of reagents) {
        let item = await db.item_master.findFirst({
          where: { name: { equals: r.reagent_name, mode: 'insensitive' } },
        });
        if (!item) {
          const cat = await db.item_categories.findFirst({ where: { item_type: 'REAGENT' } });
          if (!cat) continue;
          item = await db.item_master.create({
            data: {
              item_code: `REG${Date.now().toString().slice(-6)}`,
              name: r.reagent_name,
              category_id: cat.id,
              item_type: 'REAGENT',
              base_uom: 'Unit',
              purchase_uom: 'Unit',
              organizationId,
              updated_at: new Date(),
            },
          });
        }
        await db.store_stocks.upsert({
          where: {
            store_id_item_id_batch_id: { store_id: labStore.id, item_id: item.id, batch_id: null },
          },
          create: {
            store_id: labStore.id,
            item_id: item.id,
            quantity_on_hand: r.current_stock || 0,
            avg_unit_cost: 0,
            organizationId,
            updated_at: new Date(),
          },
          update: { quantity_on_hand: r.current_stock || 0, updated_at: new Date() },
        });
        migrated++;
      }
    }

    await logAuditEvent({
      userId: session.id,
      username: session.username,
      role: session.role,
      action: 'MIGRATE',
      module: 'inventory',
      details: `Migrated ${migrated} legacy stock records`,
    });

    return { success: true, data: { migrated } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}