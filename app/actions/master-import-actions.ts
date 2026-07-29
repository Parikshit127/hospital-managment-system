'use server';

import { requireTenantContext } from '@/backend/tenant';
import {
  createDoctor, updateDoctor,
} from './doctor-master-actions';
import {
  createService, updateService,
  createLabTest, updateLabTest,
  createPackage, updatePackage,
  createRadiologyImaging, updateRadiologyImaging,
} from './service-master-actions';
import {
  createMedicine, updateMedicine,
} from './medicine-master-actions';
import type { MasterImportType } from '@/app/lib/import/master-validators';
import { MASTER_IMPORT_MAX_ROWS } from '@/app/lib/import/master-validators';

export interface ImportRowFailure {
  rowIndex: number;
  reason: string;
  originalData: Record<string, unknown>;
}

export interface ImportMasterResult {
  imported: number;
  updated: number;
  failed: ImportRowFailure[];
}

// Natural key per master used to decide update-vs-create (upsert). The lookup is
// always scoped to the caller's organization; `where` adds any extra filter.
const UPSERT_CONFIG: Record<MasterImportType, { model: string; key: string; where?: Record<string, unknown> }> = {
  doctor_master: { model: 'user', key: 'username', where: { role: 'doctor' } },
  service_master: { model: 'ipdServiceMaster', key: 'service_code' },
  lab_test_master: { model: 'lab_test_inventory', key: 'test_name' },
  package_master: { model: 'ipdPackage', key: 'package_code' },
  medicine_master: { model: 'pharmacy_medicine_master', key: 'brand_name' },
  radiology_master: { model: 'radiology_imaging', key: 'procedure_code' },
};

async function createRow(type: MasterImportType, row: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  switch (type) {
    case 'doctor_master':
      // A brand-new doctor needs a password (an exported file has none).
      if (!String(row.password ?? '').trim()) {
        return { success: false, error: 'password is required to create a new doctor' };
      }
      return createDoctor(row);
    case 'service_master': return createService(row);
    case 'lab_test_master': return createLabTest(row);
    case 'package_master': return createPackage({ ...(row as any), inclusions: [] });
    case 'medicine_master': return createMedicine(row);
    case 'radiology_master': return createRadiologyImaging(row);
    default: throw new Error(`Unknown import type: ${type}`);
  }
}

async function updateRow(type: MasterImportType, id: any, row: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  switch (type) {
    case 'doctor_master': {
      // Blank password on an update means "keep the existing one" — drop the key
      // so the update schema doesn't try to set an empty password.
      const { password, ...rest } = row as any;
      const data = String(password ?? '').trim() ? row : rest;
      return updateDoctor(id, data);
    }
    case 'service_master': return updateService(id, row);
    case 'lab_test_master': return updateLabTest(id, row);
    case 'package_master': return updatePackage(id, row);
    case 'medicine_master': return updateMedicine(id, row);
    case 'radiology_master': return updateRadiologyImaging(id, row);
    default: throw new Error(`Unknown import type: ${type}`);
  }
}

export async function importMasterData(
  type: MasterImportType,
  rows: Record<string, unknown>[],
): Promise<{ success: boolean; data?: ImportMasterResult; error?: string }> {
  try {
    const { db, session, organizationId } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    if (rows.length > MASTER_IMPORT_MAX_ROWS) {
      return { success: false, error: `Maximum ${MASTER_IMPORT_MAX_ROWS} rows per import (got ${rows.length})` };
    }

    const cfg = UPSERT_CONFIG[type];
    let imported = 0; // newly created
    let updated = 0;  // matched an existing record and updated it
    const failed: ImportRowFailure[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Upsert: if a record with the same natural key already exists in this
        // org, update it; otherwise create a new one. Lets an exported sheet be
        // edited and re-imported to UPDATE existing records instead of erroring
        // as duplicates.
        let existing: { id: any } | null = null;
        const keyVal = cfg ? (row as any)[cfg.key] : undefined;
        if (cfg && keyVal !== undefined && keyVal !== null && String(keyVal).trim() !== '') {
          existing = await (db as any)[cfg.model].findFirst({
            where: { organizationId, [cfg.key]: keyVal, ...(cfg.where || {}) },
            select: { id: true },
          });
        }

        const result = existing
          ? await updateRow(type, existing.id, row)
          : await createRow(type, row);

        if (result.success) {
          if (existing) updated++; else imported++;
        } else {
          failed.push({ rowIndex: i + 1, reason: result.error || 'Unknown error', originalData: row });
        }
      } catch (e: any) {
        failed.push({ rowIndex: i + 1, reason: e.message || 'Unexpected error', originalData: row });
      }
    }

    // Single audit log entry for the bulk operation
    try {
      await db.system_audit_logs.create({
        data: {
          action: `BULK_IMPORT_${type.toUpperCase()}`,
          module: 'master-data',
          details: `Bulk import ${type}: ${imported} created, ${updated} updated, ${failed.length} failed`,
          organizationId,
          user_id: session.id,
          username: session.username,
          role: session.role,
        },
      });
    } catch {
      // audit failure should not fail the import response
    }

    return { success: true, data: { imported, updated, failed } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
