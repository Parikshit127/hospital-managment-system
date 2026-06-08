'use server';
import { requireTenantContext } from '@/backend/tenant';
import { z } from 'zod';

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) =>
    typeof v === 'object' && v !== null && v?.constructor?.name === 'Decimal' ? Number(v) : v));
}

// Optional text/number fields map to nullable DB columns. Forms may submit '',
// null, or undefined when a field is left blank — normalize them so validation
// never rejects an empty optional value (e.g. clearing Sample Type / Unit / HSN).
const optionalText = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable().optional(),
);
const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.number().nullable().optional(),
);

// Translate common DB errors into user-friendly messages (e.g. renaming a lab
// test to a name that already exists hits the unique constraint).
function toMessage(e: any, duplicateLabel = 'name'): string {
  if (e?.code === 'P2002') return `A record with this ${duplicateLabel} already exists.`;
  if (e?.code === 'P2025') return 'Record not found.';
  return e?.message || 'Operation failed';
}

// ---- Generic services (IpdServiceMaster) ----
const serviceSchema = z.object({
  service_code: z.string().min(1),
  service_name: z.string().min(1),
  service_category: z.enum(['OPD Consultation','ICU','Procedure','Room','Nursing','Diet','Consumable','Misc']),
  default_rate: z.number().nonnegative(),
  hsn_sac_code: optionalText,
  tax_rate: z.number().nonnegative().default(0),
  is_active: z.boolean().default(true),
});

export async function listServices(opts?: { search?: string; category?: string; page?: number; limit?: number }) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const where: any = { organizationId };
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
    const row = await db.ipdServiceMaster.create({ data: { ...data, organizationId } });
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
  category: optionalText,
  sample_type: optionalText,
  unit: optionalText,
  normal_range_min: optionalNumber,
  normal_range_max: optionalNumber,
  hsn_sac_code: optionalText,
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
    const row = await db.lab_test_inventory.create({ data: { ...data, organizationId } });
    await db.system_audit_logs.create({ data: {
      action: 'CREATE_LAB_TEST', module: 'master-data',
      details: `Created lab test ${data.test_name}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: row };
  } catch (e: any) { return { success: false, error: toMessage(e, 'test name') }; }
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
  } catch (e: any) { return { success: false, error: toMessage(e, 'test name') }; }
}

// ---- Packages (IpdPackage) ----
const packageSchema = z.object({
  package_code: z.string().min(1),
  package_name: z.string().min(1),
  description: z.string().optional(),
  total_amount: z.number().nonnegative(),
  validity_days: z.number().int().positive().default(7),
  inclusions: z.array(z.object({ service_id: z.number().optional(), name: z.string(), qty: z.number().default(1), amount: z.number().optional() })).default([]),
  exclusions: z.string().optional(),
  is_active: z.boolean().default(true),
});

export async function listPackages(opts?: { search?: string; page?: number; limit?: number }) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const where: any = { organizationId };
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
    const row = await db.ipdPackage.create({ data: { ...data, organizationId } });
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

export async function deleteService(id: number) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    await db.ipdServiceMaster.delete({ where: { id } });
    await db.system_audit_logs.create({ data: {
      action: 'DELETE_SERVICE', module: 'master-data',
      details: `Deleted service ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function deleteLabTest(id: number) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    await db.lab_test_inventory.delete({ where: { id } });
    await db.system_audit_logs.create({ data: {
      action: 'DELETE_LAB_TEST', module: 'master-data',
      details: `Deleted lab test ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function deletePackage(id: number) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    await db.ipdPackage.delete({ where: { id } });
    await db.system_audit_logs.create({ data: {
      action: 'DELETE_PACKAGE', module: 'master-data',
      details: `Deleted package ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}
