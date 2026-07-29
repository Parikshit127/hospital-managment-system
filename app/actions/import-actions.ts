'use server';

import { requireRoleAndTenant } from '@/backend/tenant';
import { autoMatchColumns, getUnmappedRequiredFields } from '@/app/lib/import/column-matcher';
import { getTemplate, getAllTemplates, getRequiredColumns } from '@/app/lib/import/templates';
import { validateImportData } from '@/app/lib/import/validators';
import { processImportBatch, CHUNK_SIZE } from '@/app/lib/import/chunked-processor';
import { generateErrorCSV } from '@/app/lib/import/error-reporter';
import type {
    ImportType,
    ColumnMapping,
    ValidationResult,
    BatchResult,
    ImportJobSummary,
    DuplicateResolution,
} from '@/app/types/import';

// ========================================
// Template Actions
// ========================================

export async function getImportTemplates() {
    await requireRoleAndTenant(['admin']);
    return { success: true, templates: getAllTemplates() };
}

export async function getImportTemplate(importType: ImportType) {
    await requireRoleAndTenant(['admin']);
    return { success: true, template: getTemplate(importType) };
}

// ========================================
// Job Management
// ========================================

export async function createImportJob(
    importType: ImportType,
    fileName: string,
    fileSize: number,
    totalRows: number,
    headers: string[],
    data: Record<string, string>[],
) {
    const { db, session } = await requireRoleAndTenant(['admin']);

    const template = getTemplate(importType);
    const autoMapping = autoMatchColumns(headers, template.columns);

    const job = await db.dataImportJob.create({
        data: {
            import_type: importType,
            file_name: fileName,
            file_size: fileSize,
            total_rows: totalRows,
            status: 'mapping',
            column_mapping: autoMapping,
            import_data: data,
            created_by: session.username,
        },
    });

    return {
        success: true,
        jobId: job.id,
        autoMapping,
        unmappedRequired: getUnmappedRequiredFields(autoMapping, template.columns),
    };
}

export async function saveColumnMapping(jobId: string, mapping: ColumnMapping) {
    const { db } = await requireRoleAndTenant(['admin']);

    // Verify all required fields are mapped
    const job = await db.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: 'Import job not found' };

    const template = getTemplate(job.import_type as ImportType);
    const requiredColumns = getRequiredColumns(job.import_type as ImportType);
    const mappedTargets = new Set(Object.values(mapping).map(m => m.targetField));

    const missingRequired = requiredColumns.filter(c => !mappedTargets.has(c.name));
    if (missingRequired.length > 0) {
        return {
            success: false,
            error: `Missing required columns: ${missingRequired.map(c => c.name).join(', ')}`,
            missingColumns: missingRequired,
        };
    }

    await db.dataImportJob.update({
        where: { id: jobId },
        data: { column_mapping: mapping, status: 'validating' },
    });

    return { success: true, templateName: template.name };
}

// ========================================
// Validation
// ========================================

export async function validateImportJob(jobId: string): Promise<{ success: boolean; result?: ValidationResult; error?: string }> {
    const { db } = await requireRoleAndTenant(['admin']);

    const job = await db.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: 'Import job not found' };
    if (!job.column_mapping) return { success: false, error: 'Column mapping not set' };

    const data = (job.import_data || []) as Record<string, string>[];
    const mapping = job.column_mapping as ColumnMapping;

    const result = await validateImportData(
        data,
        mapping,
        job.import_type as ImportType,
        db,
    );

    await db.dataImportJob.update({
        where: { id: jobId },
        data: {
            status: 'validated',
            validation_summary: result as unknown as Record<string, unknown>,
        },
    });

    return { success: true, result };
}

// ========================================
// Duplicate Resolution
// ========================================

export async function resolveDuplicates(jobId: string, resolutions: DuplicateResolution[]) {
    const { db } = await requireRoleAndTenant(['admin']);

    const job = await db.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: 'Import job not found' };

    const validation = job.validation_summary as { duplicates?: DuplicateResolution[] } | null;
    if (!validation) return { success: false, error: 'No validation data found' };

    // Store resolutions in validation summary
    const updatedValidation = {
        ...validation,
        duplicateResolutions: resolutions,
    };

    await db.dataImportJob.update({
        where: { id: jobId },
        data: { validation_summary: updatedValidation as unknown as Record<string, unknown> },
    });

    return { success: true };
}

// ========================================
// Import Execution
// ========================================

export async function executeImportBatch(
    jobId: string,
    startRow: number,
): Promise<{ success: boolean; result?: BatchResult; error?: string }> {
    const { db, organizationId } = await requireRoleAndTenant(['admin']);

    const job = await db.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: 'Import job not found' };
    if (!['validated', 'importing'].includes(job.status)) {
        return { success: false, error: `Cannot import in status: ${job.status}` };
    }

    const data = (job.import_data || []) as Record<string, string>[];
    const mapping = job.column_mapping as ColumnMapping;

    // Determine rows to skip (duplicates marked as 'skip')
    const validation = job.validation_summary as {
        duplicates?: { importRow: number; resolution?: string }[];
        duplicateResolutions?: DuplicateResolution[];
    } | null;
    const skipRows = new Set<number>();

    if (validation?.duplicateResolutions) {
        for (const res of validation.duplicateResolutions) {
            if (res.resolution === 'skip') {
                skipRows.add(res.importRow);
            }
        }
    }

    // Also skip rows with validation errors
    const errors = (validation as { errors?: { row: number }[] } | null)?.errors;
    if (errors) {
        for (const err of errors) {
            skipRows.add(err.row);
        }
    }

    // Update status to importing on first batch
    if (startRow === 0) {
        await db.dataImportJob.update({
            where: { id: jobId },
            data: { status: 'importing', started_at: new Date() },
        });
    }

    const result = await processImportBatch(
        data,
        mapping,
        job.import_type as ImportType,
        startRow,
        db,
        organizationId,
        skipRows,
    );

    // Update progress
    const updateData: Record<string, unknown> = {
        processed_rows: (job.processed_rows || 0) + result.processed,
        successful_rows: (job.successful_rows || 0) + result.successful,
        failed_rows: (job.failed_rows || 0) + result.failed,
        skipped_rows: (job.skipped_rows || 0) + (result.processed - result.successful - result.failed),
    };

    // Append errors to error log
    if (result.errors.length > 0) {
        const existingErrors = (job.error_log || []) as unknown[];
        updateData.error_log = [...existingErrors, ...result.errors];
    }

    if (result.isComplete) {
        updateData.status = 'completed';
        updateData.completed_at = new Date();
        // Clear import_data to free storage after completion
        updateData.import_data = null;
    }

    await db.dataImportJob.update({
        where: { id: jobId },
        data: updateData,
    });

    return { success: true, result };
}

// ========================================
// Job Status & History
// ========================================

export async function getImportJobStatus(jobId: string) {
    const { db } = await requireRoleAndTenant(['admin']);

    const job = await db.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: 'Import job not found' };

    return {
        success: true,
        job: {
            id: job.id,
            importType: job.import_type,
            fileName: job.file_name,
            status: job.status,
            totalRows: job.total_rows,
            processedRows: job.processed_rows,
            successfulRows: job.successful_rows,
            failedRows: job.failed_rows,
            skippedRows: job.skipped_rows,
            createdAt: job.created_at,
            completedAt: job.completed_at,
            createdBy: job.created_by,
        } as ImportJobSummary,
    };
}

export async function getImportHistory(page: number = 1, limit: number = 20) {
    const { db } = await requireRoleAndTenant(['admin']);

    const [jobs, total] = await Promise.all([
        db.dataImportJob.findMany({
            orderBy: { created_at: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                import_type: true,
                file_name: true,
                status: true,
                total_rows: true,
                successful_rows: true,
                failed_rows: true,
                skipped_rows: true,
                created_at: true,
                completed_at: true,
                created_by: true,
            },
        }),
        db.dataImportJob.count(),
    ]);

    return {
        success: true,
        jobs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
}

export async function cancelImport(jobId: string) {
    const { db } = await requireRoleAndTenant(['admin']);

    const job = await db.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: 'Import job not found' };

    if (['completed', 'cancelled'].includes(job.status)) {
        return { success: false, error: `Cannot cancel a ${job.status} job` };
    }

    await db.dataImportJob.update({
        where: { id: jobId },
        data: { status: 'cancelled', completed_at: new Date() },
    });

    return { success: true };
}

export async function downloadErrorReport(jobId: string) {
    const { db } = await requireRoleAndTenant(['admin']);

    const job = await db.dataImportJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: 'Import job not found' };

    const errors = (job.error_log || []) as { row: number; field: string; value: unknown; message: string; severity: string }[];
    const csv = generateErrorCSV(errors.map(e => ({
        ...e,
        severity: e.severity as 'error' | 'warning',
    })));

    return { success: true, csv };
}

// ========================================
// Archive Actions
// ========================================

export async function searchArchive(query: string, page: number = 1) {
    const { organizationId } = await requireRoleAndTenant(['admin']);

    const { searchArchivedRecords } = await import('@/backend/services/archive-service');
    const result = await searchArchivedRecords(organizationId, query, page);

    return { success: true, ...result };
}

export async function getArchiveDetail(archiveId: string) {
    const { organizationId } = await requireRoleAndTenant(['admin']);

    const { getArchivedRecordDetail } = await import('@/backend/services/archive-service');
    const record = await getArchivedRecordDetail(organizationId, archiveId);

    if (!record) return { success: false, error: 'Archived record not found' };
    return { success: true, record };
}

export async function triggerArchival(olderThanYears: number = 5) {
    const { organizationId } = await requireRoleAndTenant(['admin']);

    const { archiveOldPatientRecords } = await import('@/backend/services/archive-service');
    const result = await archiveOldPatientRecords(organizationId, olderThanYears);

    return { success: true, ...result };
}

export async function getChunkSize() {
    return CHUNK_SIZE;
}
