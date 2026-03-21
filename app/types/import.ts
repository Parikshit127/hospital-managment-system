export type ImportType = 'patients' | 'staff' | 'invoices' | 'lab_results' | 'pharmacy' | 'appointments';

export type ImportJobStatus =
    | 'uploaded'
    | 'mapping'
    | 'validating'
    | 'validated'
    | 'importing'
    | 'completed'
    | 'failed'
    | 'cancelled';

export type ColumnType = 'string' | 'number' | 'date' | 'email' | 'phone' | 'enum' | 'aadhaar' | 'boolean';

export interface ImportColumn {
    name: string;
    required: boolean;
    type: ColumnType;
    description: string;
    example?: string;
    values?: string[];
    maxLength?: number;
}

export interface ImportTemplate {
    import_type: ImportType;
    name: string;
    description: string;
    columns: ImportColumn[];
}

export interface ColumnMapping {
    [sourceColumn: string]: {
        targetField: string;
        confidence: number;
        autoDetected: boolean;
    };
}

export interface ValidationError {
    row: number;
    field: string;
    value: unknown;
    message: string;
    severity: 'error' | 'warning';
}

export interface DuplicateRecord {
    importRow: number;
    importData: Record<string, unknown>;
    existingRecord: {
        id: string | number;
        patient_id?: string;
        data: Record<string, unknown>;
    };
    matchType: 'exact' | 'fuzzy';
    matchedFields: string[];
    confidence: number;
    resolution?: 'skip' | 'merge' | 'import';
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    duplicates: DuplicateRecord[];
    qualityScore: number;
    summary: {
        totalRows: number;
        validRows: number;
        errorRows: number;
        warningRows: number;
        duplicateRows: number;
    };
}

export interface BatchResult {
    processed: number;
    successful: number;
    failed: number;
    errors: ValidationError[];
    nextStartRow: number;
    isComplete: boolean;
}

export interface ImportJobSummary {
    id: string;
    importType: ImportType;
    fileName: string;
    status: ImportJobStatus;
    totalRows: number;
    processedRows: number;
    successfulRows: number;
    failedRows: number;
    skippedRows: number;
    createdAt: Date;
    completedAt: Date | null;
    createdBy: string;
}

export interface ParsedFile {
    headers: string[];
    previewRows: Record<string, string>[];
    totalRows: number;
    data: Record<string, string>[];
}

export interface DuplicateResolution {
    importRow: number;
    resolution: 'skip' | 'merge' | 'import';
}
