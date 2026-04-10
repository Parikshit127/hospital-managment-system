'use server';
import { requireTenantContext } from '@/backend/tenant';
import { z } from 'zod';

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) =>
    typeof v === 'object' && v !== null && v?.constructor?.name === 'Decimal' ? Number(v) : v));
}

// ---- Medicine schema ----
const medicineSchema = z.object({
  brand_name: z.string().min(1),
  generic_name: z.string().optional(),
  category: z.string().optional(),
  manufacturer: z.string().optional(),
  strength: z.string().optional(),
  form: z.string().optional(),
  mrp: z.number().nonnegative(),
  purchase_price: z.number().nonnegative(),
  selling_price: z.number().nonnegative(),
  gst_percent: z.number().nonnegative().default(0),
  min_threshold: z.number().int().nonnegative().default(10),
  hsn_sac_code: z.string().optional(),
  is_active: z.boolean().default(true),
});

// ---- Batch schema ----
const batchSchema = z.object({
  medicine_id: z.number().int().positive(),
  batch_no: z.string().min(1),
  current_stock: z.number().int().nonnegative(),
  manufacture_date: z.string().datetime().optional().or(z.literal('').transform(() => undefined)),
  expiry_date: z.string().datetime(),
  cost_price: z.number().nonnegative().optional(),
  rack_location: z.string().optional(),
  supplier_name: z.string().optional(),
});

// ---- List medicines ----
export async function listMedicines(opts?: { search?: string; page?: number; limit?: number }) {
  try {
    const { db } = await requireTenantContext();
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const where: any = {};
    if (opts?.search?.trim()) where.OR = [
      { brand_name: { contains: opts.search, mode: 'insensitive' } },
      { generic_name: { contains: opts.search, mode: 'insensitive' } },
      { category: { contains: opts.search, mode: 'insensitive' } },
    ];
    const [rows, total] = await Promise.all([
      db.pharmacy_medicine_master.findMany({
        where,
        orderBy: { brand_name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          batches: { select: { current_stock: true, expiry_date: true, batch_no: true } },
        },
      }),
      db.pharmacy_medicine_master.count({ where }),
    ]);
    const medicines = rows.map((m: typeof rows[number]) => ({
      ...m,
      total_stock: m.batches.reduce((sum: number, b: { current_stock: number }) => sum + b.current_stock, 0),
    }));
    return {
      success: true,
      data: { medicines: serialize(medicines), total, totalPages: Math.ceil(total / limit), page },
    };
  } catch (e: any) {
    return { success: false, error: e.message, data: { medicines: [], total: 0, totalPages: 0, page: 1 } };
  }
}

// ---- Create medicine ----
export async function createMedicine(input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = medicineSchema.parse(input);
    const row = await db.pharmacy_medicine_master.create({
      data: {
        ...data,
        price_per_unit: data.selling_price,
        tax_rate: data.gst_percent,
      },
    });
    await db.system_audit_logs.create({
      data: {
        action: 'CREATE_MEDICINE',
        module: 'master-data',
        details: `Created medicine ${data.brand_name}`,
        organizationId,
        user_id: session.id,
        username: session.username,
        role: session.role,
      },
    });
    return { success: true, data: serialize(row) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ---- Update medicine ----
export async function updateMedicine(id: number, input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = medicineSchema.partial().parse(input);
    const updateData: any = { ...data };
    if (data.selling_price !== undefined) updateData.price_per_unit = data.selling_price;
    if (data.gst_percent !== undefined) updateData.tax_rate = data.gst_percent;
    const row = await db.pharmacy_medicine_master.update({ where: { id }, data: updateData });
    await db.system_audit_logs.create({
      data: {
        action: 'UPDATE_MEDICINE',
        module: 'master-data',
        details: `Updated medicine ${id}`,
        organizationId,
        user_id: session.id,
        username: session.username,
        role: session.role,
      },
    });
    return { success: true, data: serialize(row) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ---- Deactivate medicine ----
export async function deactivateMedicine(id: number) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const row = await db.pharmacy_medicine_master.update({ where: { id }, data: { is_active: false } });
    await db.system_audit_logs.create({
      data: {
        action: 'DEACTIVATE_MEDICINE',
        module: 'master-data',
        details: `Deactivated medicine ${id}`,
        organizationId,
        user_id: session.id,
        username: session.username,
        role: session.role,
      },
    });
    return { success: true, data: serialize(row) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ---- List batches ----
export async function listBatches(medicineId: number) {
  try {
    const { db } = await requireTenantContext();
    const rows = await db.pharmacy_batch_inventory.findMany({
      where: { medicine_id: medicineId },
      orderBy: { expiry_date: 'asc' },
    });
    return { success: true, data: serialize(rows) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ---- Add batch ----
export async function addBatch(input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = batchSchema.parse(input);
    const row = await db.pharmacy_batch_inventory.create({
      data: {
        ...data,
        expiry_date: new Date(data.expiry_date),
        manufacture_date: data.manufacture_date ? new Date(data.manufacture_date) : undefined,
      },
    });
    await db.system_audit_logs.create({
      data: {
        action: 'ADD_BATCH',
        module: 'master-data',
        details: `Added batch ${data.batch_no} for medicine ${data.medicine_id}`,
        organizationId,
        user_id: session.id,
        username: session.username,
        role: session.role,
      },
    });
    return { success: true, data: serialize(row) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ---- Update batch ----
export async function updateBatch(id: number, input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = batchSchema.partial().parse(input);
    const updateData: any = { ...data };
    if (data.expiry_date !== undefined) updateData.expiry_date = new Date(data.expiry_date);
    if (data.manufacture_date !== undefined) updateData.manufacture_date = new Date(data.manufacture_date);
    const row = await db.pharmacy_batch_inventory.update({ where: { id }, data: updateData });
    await db.system_audit_logs.create({
      data: {
        action: 'UPDATE_BATCH',
        module: 'master-data',
        details: `Updated batch ${id}`,
        organizationId,
        user_id: session.id,
        username: session.username,
        role: session.role,
      },
    });
    return { success: true, data: serialize(row) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
