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
  service_category: z.enum(['OPD Consultation','ICU','Procedure','Room','Nursing','Diet','Consumable','Home Care','Visit Charges','Observation Ward/Bed Charges','Misc']),
  default_rate: z.number().nonnegative(),
  hsn_sac_code: optionalText,
  tax_rate: z.number().nonnegative().default(0),
  is_active: z.boolean().default(true),
  requires_rendered_by: z.boolean().default(false),
  is_price_editable: z.boolean().default(false),
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

    const exclusivePackagesRaw = await db.ipdPackage.findMany({
      where: { organizationId, is_active: true, exclusive_provider_id: providerId },
      orderBy: { package_name: 'asc' },
      select: { id: true, package_code: true, package_name: true, total_amount: true, validity_days: true, description: true },
    });
    const exclusiveRates = await db.ipdPackageTpaRate.findMany({
      where: { organizationId, provider_id: providerId, package_id: { in: exclusivePackagesRaw.map((p: any) => p.id) } },
      select: { package_id: true, tpa_amount: true, tpa_package_name: true },
    });
    const exclusiveRateByPackageId = new Map<number, any>(exclusiveRates.map((r: any) => [r.package_id, r]));
    // Shaped identically to `rows` so the UI can render both in one table —
    // exclusive packages always have a rate row (created alongside the package),
    // but fall back to total_amount defensively if one is ever missing.
    const exclusivePackages = exclusivePackagesRaw.map((p: any) => {
      const rate = exclusiveRateByPackageId.get(p.id);
      return {
        package_id: p.id,
        package_code: p.package_code,
        package_name: p.package_name,
        total_amount: p.total_amount,
        validity_days: p.validity_days,
        description: p.description,
        tpa_amount: rate ? rate.tpa_amount : p.total_amount,
        tpa_package_name: rate ? rate.tpa_package_name : null,
      };
    });

    return { success: true, data: { rows: serialize(rows), exclusivePackages: serialize(exclusivePackages) } };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function bulkUpsertPackageTpaRates(
  providerId: number,
  rates: { package_id: number; tpa_amount: number | null; tpa_package_name?: string | null }[],
) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };

    // Packages exclusive to this provider have no cash price and no fallback
    // rate — their IpdPackageTpaRate row IS their only price. Never let a
    // cleared input delete it, and keep IpdPackage.total_amount mirroring the
    // rate (same invariant createExclusivePackage/updateExclusivePackage keep),
    // so the Package List view doesn't show a stale amount.
    const packageIds = rates.map((r) => r.package_id);
    const packages = await db.ipdPackage.findMany({
      where: { id: { in: packageIds }, organizationId },
      select: { id: true, exclusive_provider_id: true },
    });
    const exclusiveIds = new Set(
      packages.filter((p: any) => p.exclusive_provider_id === providerId).map((p: any) => p.id),
    );

    let upserted = 0;
    let deleted = 0;
    await db.$transaction(async (tx: any) => {
      for (const r of rates) {
        const isExclusive = exclusiveIds.has(r.package_id);
        const name = r.tpa_package_name?.trim() || null;
        if (r.tpa_amount === null || r.tpa_amount === undefined) {
          if (isExclusive) continue;
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
        if (isExclusive) {
          await tx.ipdPackage.update({ where: { id: r.package_id }, data: { total_amount: r.tpa_amount } });
        }
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
  tpa_package_name: z.string().nullish(),
});

export async function createExclusivePackage(providerId: number, input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const { tpa_package_name, ...data } = exclusivePackageSchema.parse(input);

    const row = await db.$transaction(async (tx: any) => {
      const pkg = await tx.ipdPackage.create({
        data: { ...data, organizationId, exclusive_provider_id: providerId },
      });
      await tx.ipdPackageTpaRate.create({
        data: {
          package_id: pkg.id, provider_id: providerId, organizationId,
          tpa_amount: data.total_amount, tpa_package_name: tpa_package_name?.trim() || null,
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

// Bulk-create exclusive packages from an Excel import — rows whose Package Code
// didn't match anything existing get created fresh instead of being skipped as
// "unknown code" (that used to be the only outcome; see importTpaRates in
// admin/master/services/page.tsx). Codes must be unique per org: any row whose
// code collides with an existing package (of any kind, for this org) is
// reported back and skipped rather than silently overwritten.
export async function bulkImportExclusivePackages(
  providerId: number,
  packages: { package_code: string; package_name: string; total_amount: number; tpa_package_name?: string | null }[],
) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    if (packages.length === 0) return { success: true, data: { created: 0, skipped: [] as string[] } };

    const existing = await db.ipdPackage.findMany({
      where: { organizationId, package_code: { in: packages.map((p) => p.package_code) } },
      select: { package_code: true },
    });
    const existingCodes = new Set(existing.map((e: any) => e.package_code));
    const toCreate = packages.filter((p) => !existingCodes.has(p.package_code));
    const skipped = packages.filter((p) => existingCodes.has(p.package_code)).map((p) => p.package_code);

    await db.$transaction(async (tx: any) => {
      for (const p of toCreate) {
        const pkg = await tx.ipdPackage.create({
          data: {
            package_code: p.package_code, package_name: p.package_name,
            total_amount: p.total_amount, organizationId, exclusive_provider_id: providerId,
          },
        });
        await tx.ipdPackageTpaRate.create({
          data: {
            package_id: pkg.id, provider_id: providerId, organizationId,
            tpa_amount: p.total_amount, tpa_package_name: p.tpa_package_name?.trim() || null,
          },
        });
      }
    });

    await db.system_audit_logs.create({ data: {
      action: 'BULK_IMPORT_EXCLUSIVE_PACKAGES', module: 'master-data',
      details: `Created ${toCreate.length} exclusive package(s) for provider ${providerId}${skipped.length ? `, skipped ${skipped.length} existing code(s)` : ''}`,
      organizationId, user_id: session.id, username: session.username, role: session.role,
    }});

    return { success: true, data: { created: toCreate.length, skipped } };
  } catch (e: any) { return { success: false, error: toMessage(e, 'package code') }; }
}

export async function updateExclusivePackage(packageId: number, input: unknown) {
  try {
    const { db, organizationId, session } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    const { tpa_package_name, ...data } = exclusivePackageSchema.parse(input);

    const row = await db.$transaction(async (tx: any) => {
      const existing = await tx.ipdPackage.findFirst({ where: { id: packageId, organizationId } });
      if (!existing) throw new Error('Package not found');
      if (!existing.exclusive_provider_id) throw new Error('Not an exclusive package');

      const pkg = await tx.ipdPackage.update({ where: { id: packageId }, data });
      // Keep the linked rate row's tpa_amount (and name, if this call set one)
      // in sync — getPackagesForAdmission resolves exclusive-package price from
      // IpdPackageTpaRate, not total_amount.
      await tx.ipdPackageTpaRate.updateMany({
        where: { package_id: packageId, provider_id: existing.exclusive_provider_id, organizationId },
        data: {
          tpa_amount: data.total_amount,
          ...(tpa_package_name !== undefined ? { tpa_package_name: tpa_package_name?.trim() || null } : {}),
        },
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
