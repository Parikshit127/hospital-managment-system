import type { ValidationError, ValidationResult, DuplicateRecord } from '@/app/types/import';

export function formatErrorsForCSV(errors: ValidationError[]): Record<string, string>[] {
    return errors.map(e => ({
        'Row Number': String(e.row + 1), // 1-indexed for user display
        'Field': e.field,
        'Value': e.value !== null && e.value !== undefined ? String(e.value) : '',
        'Error': e.message,
        'Severity': e.severity,
    }));
}

export function formatDuplicatesForCSV(duplicates: DuplicateRecord[]): Record<string, string>[] {
    return duplicates.map(d => ({
        'Import Row': String(d.importRow + 1),
        'Match Type': d.matchType,
        'Matched Fields': d.matchedFields.join(', '),
        'Confidence': `${Math.round(d.confidence * 100)}%`,
        'Existing Patient ID': d.existingRecord.patient_id || String(d.existingRecord.id),
        'Resolution': d.resolution || 'pending',
    }));
}

export function generateErrorCSV(errors: ValidationError[]): string {
    const rows = formatErrorsForCSV(errors);
    if (rows.length === 0) return '';

    const headers = Object.keys(rows[0]);
    const csvRows = [
        headers.map(h => `"${h}"`).join(','),
        ...rows.map(row =>
            headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
        ),
    ];
    return csvRows.join('\n');
}

export function generateImportSummary(result: ValidationResult, importType: string): string {
    const lines = [
        `Import Summary - ${importType}`,
        `========================================`,
        `Total Rows: ${result.summary.totalRows}`,
        `Valid Rows: ${result.summary.validRows}`,
        `Rows with Errors: ${result.summary.errorRows}`,
        `Rows with Warnings: ${result.summary.warningRows}`,
        `Duplicate Rows: ${result.summary.duplicateRows}`,
        `Data Quality Score: ${result.qualityScore}%`,
        ``,
        `Can Proceed: ${result.isValid ? 'Yes' : 'No (fix errors first)'}`,
    ];
    return lines.join('\n');
}
