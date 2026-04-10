'use server';
import { requireTenantContext } from '@/backend/tenant';
import { z } from 'zod';

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) =>
    typeof v === 'object' && v !== null && v?.constructor?.name === 'Decimal' ? Number(v) : v));
}

// ---- Generic services (IpdServiceMaster) ----
const serviceSchema = z.object({
  service_code: z.string().min(1),
  service_name: z.string().min(1),
  service_category: z.enum(['OPD Consultation','ICU','Procedure','Room','Nursing','Diet','Consumable','Misc']),
  default_rate: z.number().nonnegative(),
  hsn_sac_code: z.string().optional(),
  tax_rate: z.number().nonnegative().default(0),
  is_active: z.boolean().default(true),
});

export async function listServices(opts?: { search?: string; category?: string; page?: number; limit?: number }) {
  try {
    const { db } = await requireTenantContext();
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const where: any = {};
    if (opts?.category) where.service_category = opts.category;
    if (opts?.search?.trim()) where.OR = [
      { service_name: { contains: opts.search, mode: 'insensitive' } },
      { service_code: { contains: opts.search, mode: 'insensitive' } },
    ];
    const [rows, total] = await Promise.all([
      db.ipdServiceMaster.findMany({ where, orderBy: { created_at: 'desc' }, skip: (page-1)*limit, take: limit }),
      db.ipdServiceMaster.count({ where }),
    ]);
    return { success: true, data: { rows: serialize(rows), total, totalPages: Math.ceil(total/limit), page } };
  } catch (e: any) { return { success: false, error: e.message, data: { rows: [], total: 0, totalPages: 0, page: 1 } }; }
}

export async function createService(input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = serviceSchema.parse(input);
    const row = await db.ipdServiceMaster.create({ data });
    await db.system_audit_logs.create({ data: {
      action: 'CREATE_SERVICE', module: 'master-data',
      details: `Created service ${data.service_name}`,
      organizationId, user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: serialize(row) };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function updateService(id: number, input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = serviceSchema.partial().parse(input);
    const row = await db.ipdServiceMaster.update({ where: { id }, data });
    await db.system_audit_logs.create({ data: {
      action: 'UPDATE_SERVICE', module: 'master-data',
      details: `Updated service ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: serialize(row) };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function deactivateService(id: number) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const row = await db.ipdServiceMaster.update({ where: { id }, data: { is_active: false } });
    await db.system_audit_logs.create({ data: {
      action: 'DEACTIVATE_SERVICE', module: 'master-data',
      details: `Deactivated service ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: serialize(row) };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ---- Lab tests (lab_test_inventory) ----
const labTestSchema = z.object({
  test_name: z.string().min(1),
  price: z.number().nonnegative(),
  is_available: z.boolean().default(true),
  category: z.string().optional(),
  sample_type: z.string().optional(),
  unit: z.string().optional(),
  normal_range_min: z.number().optional(),
  normal_range_max: z.number().optional(),
  hsn_sac_code: z.string().optional(),
  tax_rate: z.number().nonnegative().default(0),
});

export async function listLabTests(opts?: { search?: string; page?: number; limit?: number }) {
  try {
    const { db } = await requireTenantContext();
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const where: any = {};
    if (opts?.search?.trim()) where.test_name = { contains: opts.search, mode: 'insensitive' };
    const [rows, total] = await Promise.all([
      db.lab_test_inventory.findMany({ where, orderBy: { test_name: 'asc' }, skip: (page-1)*limit, take: limit }),
      db.lab_test_inventory.count({ where }),
    ]);
    return { success: true, data: { rows, total, totalPages: Math.ceil(total/limit), page } };
  } catch (e: any) { return { success: false, error: e.message, data: { rows: [], total: 0, totalPages: 0, page: 1 } }; }
}

export async function createLabTest(input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = labTestSchema.parse(input);
    const row = await db.lab_test_inventory.create({ data });
    await db.system_audit_logs.create({ data: {
      action: 'CREATE_LAB_TEST', module: 'master-data',
      details: `Created lab test ${data.test_name}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: row };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function updateLabTest(id: number, input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = labTestSchema.partial().parse(input);
    const row = await db.lab_test_inventory.update({ where: { id }, data });
    await db.system_audit_logs.create({ data: {
      action: 'UPDATE_LAB_TEST', module: 'master-data',
      details: `Updated lab test ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: row };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ---- Packages (IpdPackage) ----
const packageSchema = z.object({
  package_code: z.string().min(1),
  package_name: z.string().min(1),
  description: z.string().optional(),
  total_amount: z.number().nonnegative(),
  validity_days: z.number().int().positive().default(7),
  inclusions: z.array(z.object({ service_id: z.number().optional(), name: z.string(), qty: z.number().default(1) })).default([]),
  exclusions: z.string().optional(),
  is_active: z.boolean().default(true),
});

export async function listPackages(opts?: { search?: string; page?: number; limit?: number }) {
  try {
    const { db } = await requireTenantContext();
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const where: any = {};
    if (opts?.search?.trim()) where.package_name = { contains: opts.search, mode: 'insensitive' };
    const [rows, total] = await Promise.all([
      db.ipdPackage.findMany({ where, orderBy: { created_at: 'desc' }, skip: (page-1)*limit, take: limit }),
      db.ipdPackage.count({ where }),
    ]);
    return { success: true, data: { rows: serialize(rows), total, totalPages: Math.ceil(total/limit), page } };
  } catch (e: any) { return { success: false, error: e.message, data: { rows: [], total: 0, totalPages: 0, page: 1 } }; }
}

export async function createPackage(input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = packageSchema.parse(input);
    const row = await db.ipdPackage.create({ data });
    await db.system_audit_logs.create({ data: {
      action: 'CREATE_PACKAGE', module: 'master-data',
      details: `Created package ${data.package_name}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: serialize(row) };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function updatePackage(id: number, input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = packageSchema.partial().parse(input);
    const row = await db.ipdPackage.update({ where: { id }, data });
    await db.system_audit_logs.create({ data: {
      action: 'UPDATE_PACKAGE', module: 'master-data',
      details: `Updated package ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: serialize(row) };
  } catch (e: any) { return { success: false, error: e.message }; }
}
