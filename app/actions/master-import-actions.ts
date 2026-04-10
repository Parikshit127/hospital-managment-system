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
import { MASTER_IMPORT_MAX_ROWS } from '@/app/lib/import/master-validators';

export interface ImportRowFailure {
  rowIndex: number;
  reason: string;
  originalData: Record<string, unknown>;
}

export interface ImportMasterResult {
  imported: number;
  failed: ImportRowFailure[];
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

    let imported = 0;
    const failed: ImportRowFailure[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let result: { success: boolean; error?: string };
        switch (type) {
          case 'doctor_master':
            result = await createDoctor(row);
            break;
          case 'service_master':
            result = await createService(row);
            break;
          case 'lab_test_master':
            result = await createLabTest(row);
            break;
          case 'package_master':
            result = await createPackage({ ...(row as any), inclusions: [] });
            break;
          case 'medicine_master':
            result = await createMedicine(row);
            break;
          default:
            throw new Error(`Unknown import type: ${type}`);
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
