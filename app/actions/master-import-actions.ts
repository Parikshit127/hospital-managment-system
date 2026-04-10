'use server';

import { requireTenantContext } from '@/backend/tenant';
import {
  createDoctor,
} from './doctor-master-actions';
import {
  createService, createLabTest, createPackage,
} from './service-master-actions';
import {
  createMedicine,
} from './medicine-master-actions';
import type { MasterImportType } from '@/app/lib/import/master-validators';

export interface ImportRowFailure {
  rowIndex: number;
  reason: string;
  originalData: Record<string, unknown>;
}

export interface ImportMasterResult {
  imported: number;
  failed: ImportRowFailure[];
}

const MAX_ROWS = 500;

export async function importMasterData(
  type: MasterImportType,
  rows: Record<string, unknown>[],
): Promise<{ success: boolean; data?: ImportMasterResult; error?: string }> {
  try {
    const { session, organizationId } = await requireTenantContext();
    if (session.role !== 'admin') return { success: false, error: 'Admin only' };
    if (rows.length > MAX_ROWS) {
      return { success: false, error: `Maximum ${MAX_ROWS} rows per import (got ${rows.length})` };
    }

    let imported = 0;
    const failed: ImportRowFailure[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let result: { success: boolean; error?: string };
        if (type === 'doctor_master') {
          result = await createDoctor(row);
        } else if (type === 'service_master') {
          result = await createService(row);
        } else if (type === 'lab_test_master') {
          result = await createLabTest(row);
        } else if (type === 'package_master') {
          result = await createPackage({ ...(row as any), inclusions: [] });
        } else {
          result = await createMedicine(row);
        }
        if (result.success) {
          imported++;
        } else {
          failed.push({ rowIndex: i + 1, reason: result.error || 'Unknown error', originalData: row });
        }
      } catch (e: any) {
        failed.push({ rowIndex: i + 1, reason: e.message || 'Unexpected error', originalData: row });
      }
    }

    // Single audit log entry for the bulk operation
    try {
      const { db } = await requireTenantContext();
      await db.system_audit_logs.create({
        data: {
          action: `BULK_IMPORT_${type.toUpperCase()}`,
          module: 'master-data',
          details: `Bulk import ${type}: ${imported} imported, ${failed.length} failed`,
          organizationId,
          user_id: session.id,
          username: session.username,
          role: session.role,
        },
      });
    } catch {
      // audit failure should not fail the import response
    }

    return { success: true, data: { imported, failed } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
