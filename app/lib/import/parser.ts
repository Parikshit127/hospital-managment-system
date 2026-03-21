import * as XLSX from 'xlsx';
import type { ParsedFile } from '@/app/types/import';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const PREVIEW_ROWS = 5;

export function parseFile(buffer: ArrayBuffer, fileName: string): ParsedFile {
    const ext = fileName.toLowerCase().split('.').pop();
    if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) {
        throw new Error('Unsupported file format. Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
    }

    if (buffer.byteLength > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }

    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        throw new Error('The uploaded file contains no sheets');
    }

    const sheet = workbook.Sheets[sheetName];
    const rawData: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: '',
        raw: false, // return formatted strings
    });

    if (rawData.length === 0) {
        throw new Error('The uploaded file contains no data rows');
    }

    const headers = Object.keys(rawData[0]);
    if (headers.length === 0) {
        throw new Error('No column headers found in the file');
    }

    // Normalize headers: trim whitespace
    const normalizedData = rawData.map(row => {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
            normalized[key.trim()] = String(value ?? '').trim();
        }
        return normalized;
    });

    const normalizedHeaders = headers.map(h => h.trim());

    return {
        headers: normalizedHeaders,
        previewRows: normalizedData.slice(0, PREVIEW_ROWS),
        totalRows: normalizedData.length,
        data: normalizedData,
    };
}

export function generateTemplateFile(
    headers: string[],
    sampleRows: Record<string, string>[],
    format: 'csv' | 'xlsx' = 'xlsx',
): ArrayBuffer {
    const ws = XLSX.utils.json_to_sheet(sampleRows.length > 0 ? sampleRows : [{}], {
        header: headers,
    });

    // Set column widths based on header/content length
    ws['!cols'] = headers.map(h => ({
        wch: Math.max(h.length + 2, 15),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Template');

    if (format === 'csv') {
        const csvString = XLSX.utils.sheet_to_csv(ws);
        const encoder = new TextEncoder();
        return encoder.encode(csvString).buffer as ArrayBuffer;
    }

    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
