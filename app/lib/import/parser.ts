import * as XLSX from 'xlsx';
import type { ParsedFile } from '@/app/types/import';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const PREVIEW_ROWS = 5;
/** How far down a sheet to look for the header row before giving up on row 1. */
const HEADER_SCAN_ROWS = 15;

/** Compare headers on letters and digits only, so "S.No." and "s_no" are one header. */
function normHeader(h: unknown): string {
    return String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * A real hospital sheet opens with a merged title banner, a subtitle and a blank
 * line before its actual headers — `sheet_to_json` would take that banner as the
 * header row and every column would then be unrecognised. Given the headers we
 * expect, find the row that actually carries them.
 *
 * Returns 0 (the old behaviour) when nothing scores well enough, so a file we
 * cannot read this way fails the same way it always did rather than differently.
 */
function findHeaderRow(rows: unknown[][], hints: string[]): number {
    const wanted = new Set(hints.map(normHeader));
    let best = 0;
    let bestScore = 0;
    for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_ROWS); i++) {
        const cells = (rows[i] ?? []).map(normHeader).filter(Boolean);
        // Count distinct matches: a banner row repeating one word must not win.
        const score = new Set(cells.filter(c => wanted.has(c))).size;
        if (score > bestScore) { bestScore = score; best = i; }
    }
    // Two matching headers is enough to be a header row and not a coincidence.
    return bestScore >= 2 ? best : 0;
}

export function parseFile(
    buffer: ArrayBuffer,
    fileName: string,
    opts?: {
        /** Headers this import type understands. Enables header-row detection. */
        headerHints?: string[];
    },
): ParsedFile {
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

    // Skip any title/subtitle rows above the real headers.
    let headerRow = 0;
    if (opts?.headerHints?.length) {
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, raw: false }) as unknown[][];
        headerRow = findHeaderRow(grid, opts.headerHints);
    }

    const rawData: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: '',
        raw: false, // return formatted strings
        ...(headerRow > 0 && { range: headerRow }),
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
