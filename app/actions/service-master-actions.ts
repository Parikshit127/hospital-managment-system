'use server';

import { guardAction } from '@/app/lib/action-guard';
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
  service_category: z.enum(['OPD Consultation','ICU','Procedure','Room','Nursing','Diet','Consumable','Home Care','Visit Charges','Observation Ward/Bed Charges','Misc']),
  default_rate: z.number().nonnegative(),
  hsn_sac_code: optionalText,
  tax_rate: z.number().nonnegative().default(0),
  is_active: z.boolean().default(true),
  requires_rendered_by: z.boolean().default(false),
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
    const __denied = await guardAction('service-master-actions', 'createService');
    if (__denied) return __denied;
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
    const __denied = await guardAction('service-master-actions', 'updateService');
    if (__denied) return __denied;
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
    const __denied = await guardAction('service-master-actions', 'deactivateService');
    if (__denied) return __denied;
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
    const __denied = await guardAction('service-master-actions', 'createLabTest');
    if (__denied) return __denied;
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
    const __denied = await guardAction('service-master-actions', 'updateLabTest');
    if (__denied) return __denied;
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
  description: z.string().nullish(),
  total_amount: z.number().nonnegative(),
  validity_days: z.number().int().positive().default(7),
  inclusions: z.array(z.object({ service_id: z.number().optional(), name: z.string(), qty: z.number().default(1), amount: z.number().optional() })).default([]),
  exclusions: z.string().nullish(),
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
      db.ipdPackage.findMany({
        where, orderBy: { created_at: 'desc' }, skip: (page-1)*limit, take: limit,
        include: { exclusive_provider: { select: { provider_name: true } } },
      }),
      db.ipdPackage.count({ where }),
    ]);
    return { success: true, data: { rows: serialize(rows), total, totalPages: Math.ceil(total/limit), page } };
  } catch (e: any) { return { success: false, error: e.message, data: { rows: [], total: 0, totalPages: 0, page: 1 } }; }
}

export async function createPackage(input: unknown) {
    const __denied = await guardAction('service-master-actions', 'createPackage');
    if (__denied) return __denied;
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
    const __denied = await guardAction('service-master-actions', 'updatePackage');
    if (__denied) return __denied;
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
    const __denied = await guardAction('service-master-actions', 'deleteService');
    if (__denied) return __denied;
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
    const __denied = await guardAction('service-master-actions', 'deleteLabTest');
    if (__denied) return __denied;
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
    const __denied = await guardAction('service-master-actions', 'deletePackage');
    if (__denied) return __denied;
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

// ---- Package TPA Rates (IpdPackageTpaRate) ----
// Provider-first rate sheet: pick a TPA, see/edit its negotiated price for every
// active package. A package with no row here falls back to IpdPackage.total_amount
// when applied (see resolvePackagePrice in ipd-finance-actions.ts).

export async function listPackageTpaRates(providerId: number) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const packages = await db.ipdPackage.findMany({
      where: { organizationId, is_active: true, exclusive_provider_id: null },
      orderBy: { package_name: 'asc' },
      select: { id: true, package_code: true, package_name: true, total_amount: true },
    });
    const rates = await db.ipdPackageTpaRate.findMany({
      where: { organizationId, provider_id: providerId },
      select: { package_id: true, tpa_amount: true, tpa_package_name: true },
    });
    const rateByPackageId = new Map<number, any>(rates.map((r: any) => [r.package_id, r]));
    const rows = packages.map((p: any) => {
      const rate = rateByPackageId.get(p.id);
      return {
        package_id: p.id,
        package_code: p.package_code,
        package_name: p.package_name,
        total_amount: p.total_amount,
        tpa_amount: rate ? rate.tpa_amount : null,
        tpa_package_name: rate ? rate.tpa_package_name : null,
      };
    });

    const exclusivePackages = await db.ipdPackage.findMany({
      where: { organizationId, is_active: true, exclusive_provider_id: providerId },
      orderBy: { package_name: 'asc' },
      select: { id: true, package_code: true, package_name: true, total_amount: true },
    });

    return { success: true, data: { rows: serialize(rows), exclusivePackages: serialize(exclusivePackages) } };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function bulkUpsertPackageTpaRates(
  providerId: number,
  rates: { package_id: number; tpa_amount: number | null; tpa_package_name?: string | null }[],
) {
    const __denied = await guardAction('service-master-actions', 'bulkUpsertPackageTpaRates');
    if (__denied) return __denied;
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };

    let upserted = 0;
    let deleted = 0;
    await db.$transaction(async (tx: any) => {
      for (const r of rates) {
        const name = r.tpa_package_name?.trim() || null;
        if (r.tpa_amount === null || r.tpa_amount === undefined) {
          const del = await tx.ipdPackageTpaRate.deleteMany({
            where: { package_id: r.package_id, provider_id: providerId, organizationId },
          });
          deleted += del.count;
          continue;
        }
        await tx.ipdPackageTpaRate.upsert({
          where: {
            package_id_provider_id_organizationId: {
              package_id: r.package_id, provider_id: providerId, organizationId,
            },
          },
          create: {
            package_id: r.package_id, provider_id: providerId, organizationId,
            tpa_amount: r.tpa_amount, tpa_package_name: name,
          },
          update: { tpa_amount: r.tpa_amount, tpa_package_name: name },
        });
        upserted += 1;
      }
    });

    await db.system_audit_logs.create({ data: {
      action: 'BULK_UPSERT_PACKAGE_TPA_RATES', module: 'master-data',
      details: `Updated ${upserted} TPA rate(s), removed ${deleted} for provider ${providerId}`,
      organizationId, user_id: session.id, username: session.username, role: session.role,
    }});

    return { success: true, data: { upserted, deleted } };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ---- Exclusive packages — belong to exactly one TPA, created from within that
// TPA's rate view. Package master data (code/name/rate) lives on IpdPackage same
// as shared packages; exclusive_provider_id is what scopes visibility. A matching
// IpdPackageTpaRate row is created alongside so existing rate-resolution code
// (resolvePackagePrice / getPackagesForAdmission) needs no special-casing.
const exclusivePackageSchema = z.object({
  package_code: z.string().min(1),
  package_name: z.string().min(1),
  description: z.string().nullish(),
  total_amount: z.number().nonnegative(),
  validity_days: z.number().int().positive().default(7),
});

export async function createExclusivePackage(providerId: number, input: unknown) {
    const __denied = await guardAction('service-master-actions', 'createExclusivePackage');
    if (__denied) return __denied;
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = exclusivePackageSchema.parse(input);

    const row = await db.$transaction(async (tx: any) => {
      const pkg = await tx.ipdPackage.create({
        data: { ...data, organizationId, exclusive_provider_id: providerId },
      });
      await tx.ipdPackageTpaRate.create({
        data: {
          package_id: pkg.id, provider_id: providerId, organizationId,
          tpa_amount: data.total_amount,
        },
      });
      return pkg;
    });

    await db.system_audit_logs.create({ data: {
      action: 'CREATE_EXCLUSIVE_PACKAGE', module: 'master-data',
      details: `Created exclusive package ${data.package_name} for provider ${providerId}`,
      organizationId, user_id: session.id, username: session.username, role: session.role,
    }});

    return { success: true, data: serialize(row) };
  } catch (e: any) { return { success: false, error: toMessage(e, 'package code') }; }
}

export async function updateExclusivePackage(packageId: number, input: unknown) {
    const __denied = await guardAction('service-master-actions', 'updateExclusivePackage');
    if (__denied) return __denied;
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = exclusivePackageSchema.parse(input);

    const row = await db.$transaction(async (tx: any) => {
      const existing = await tx.ipdPackage.findFirst({ where: { id: packageId, organizationId } });
      if (!existing) throw new Error('Package not found');
      if (!existing.exclusive_provider_id) throw new Error('Not an exclusive package');

      const pkg = await tx.ipdPackage.update({ where: { id: packageId }, data });
      // Keep the linked rate row's tpa_amount in sync — getPackagesForAdmission
      // resolves exclusive-package price from IpdPackageTpaRate, not total_amount.
      await tx.ipdPackageTpaRate.updateMany({
        where: { package_id: packageId, provider_id: existing.exclusive_provider_id, organizationId },
        data: { tpa_amount: data.total_amount },
      });
      return pkg;
    });

    await db.system_audit_logs.create({ data: {
      action: 'UPDATE_EXCLUSIVE_PACKAGE', module: 'master-data',
      details: `Updated exclusive package ${packageId}`,
      organizationId, user_id: session.id, username: session.username, role: session.role,
    }});

    return { success: true, data: serialize(row) };
  } catch (e: any) { return { success: false, error: toMessage(e, 'package code') }; }
}

export async function deleteExclusivePackage(packageId: number) {
    const __denied = await guardAction('service-master-actions', 'deleteExclusivePackage');
    if (__denied) return __denied;
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const pkg = await db.ipdPackage.findFirst({ where: { id: packageId, organizationId } });
    if (!pkg) return { success: false, error: 'Package not found' };
    if (!pkg.exclusive_provider_id) return { success: false, error: 'Not an exclusive package' };
    await db.ipdPackage.delete({ where: { id: packageId } });
    await db.system_audit_logs.create({ data: {
      action: 'DELETE_EXCLUSIVE_PACKAGE', module: 'master-data',
      details: `Deleted exclusive package ${packageId}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ---- Radiology/Imaging (radiology_imaging) ----
const radiologySchema = z.object({
  procedure_name: z.string().min(1),
  price: z.number().nonnegative(),
  is_available: z.boolean().default(true),
  procedure_code: optionalText,
  category: optionalText,
  description: optionalText,
  hsn_sac_code: optionalText,
  tax_rate: z.number().nonnegative().default(0),
  turnaround_time: optionalText,
  requires_prescription: z.boolean().default(false),
  modality: optionalText,
  body_part: optionalText,
});

export async function listRadiologyImaging(opts?: { search?: string; page?: number; limit?: number }) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 25;
    const where: any = { organizationId };
    if (opts?.search?.trim()) where.OR = [
      { procedure_name: { contains: opts.search, mode: 'insensitive' } },
      { modality: { contains: opts.search, mode: 'insensitive' } },
      { category: { contains: opts.search, mode: 'insensitive' } },
    ];
    const [rows, total] = await Promise.all([
      db.radiology_imaging.findMany({ where, orderBy: { procedure_name: 'asc' }, skip: (page-1)*limit, take: limit }),
      db.radiology_imaging.count({ where }),
    ]);
    return { success: true, data: { rows: serialize(rows), total, totalPages: Math.ceil(total/limit), page } };
  } catch (e: any) { return { success: false, error: e.message, data: { rows: [], total: 0, totalPages: 0, page: 1 } }; }
}

export async function createRadiologyImaging(input: unknown) {
    const __denied = await guardAction('service-master-actions', 'createRadiologyImaging');
    if (__denied) return __denied;
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = radiologySchema.parse(input);
    const row = await db.radiology_imaging.create({ data: { ...data, organizationId } });
    await db.system_audit_logs.create({ data: {
      action: 'CREATE_RADIOLOGY', module: 'master-data',
      details: `Created radiology procedure ${data.procedure_name}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: serialize(row) };
  } catch (e: any) { return { success: false, error: toMessage(e, 'procedure name') }; }
}

export async function updateRadiologyImaging(id: number, input: unknown) {
    const __denied = await guardAction('service-master-actions', 'updateRadiologyImaging');
    if (__denied) return __denied;
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const data = radiologySchema.partial().parse(input);
    const row = await db.radiology_imaging.update({ where: { id }, data });
    await db.system_audit_logs.create({ data: {
      action: 'UPDATE_RADIOLOGY', module: 'master-data',
      details: `Updated radiology procedure ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true, data: serialize(row) };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function deleteRadiologyImaging(id: number) {
    const __denied = await guardAction('service-master-actions', 'deleteRadiologyImaging');
    if (__denied) return __denied;
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    await db.radiology_imaging.delete({ where: { id } });
    await db.system_audit_logs.create({ data: {
      action: 'DELETE_RADIOLOGY', module: 'master-data',
      details: `Deleted radiology procedure ${id}`, organizationId,
      user_id: session.id, username: session.username, role: session.role,
    }});
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

// ---- Export radiology/imaging as JSON (for client-side XLSX download) ----
export async function exportRadiologyImaging() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const rows = await db.radiology_imaging.findMany({
      where: { organizationId },
      orderBy: { procedure_name: 'asc' },
    });
    return { success: true, data: serialize(rows) };
  } catch (e: any) { return { success: false, error: e.message, data: [] }; }
}
