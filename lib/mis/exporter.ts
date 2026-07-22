import ExcelJS from 'exceljs';
import { ColumnSpec } from './types';

/**
 * Optional cover information printed above the table so that whoever opens the
 * file knows what they are looking at. Without this an exported sheet is just a
 * grid of numbers with no title, date or filter context.
 */
export interface ExportMeta {
  /** Report name, e.g. "Revenue - Doctor Wise Summary". */
  title?: string;
  /** One-line description of what the report contains. */
  subtitle?: string;
  /** Hospital / organisation name. */
  hospital?: string;
  /** Human-readable filter summary, e.g. "01 Jul 2026 to 31 Jul 2026 · Status: Pending". */
  filters?: string;
  /** Who exported it. */
  generatedBy?: string;
}

/**
 * Generates a .xlsx Buffer from report data.
 *
 * @param columns  – Column definitions from the report registry (key, label, type, total)
 * @param rows     – Data rows returned by the report queryFn
 * @param totals   – Aggregated totals object (e.g. { billed_amount: 5225457, ... })
 * @param meta     – Optional title/filter block rendered above the table
 * @returns A Node.js Buffer containing the binary .xlsx file
 */
export async function generateExcelBuffer(
  columns: ColumnSpec[],
  rows: Record<string, any>[],
  totals: Record<string, number>,
  meta?: ExportMeta
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HospitalOS MIS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Report');

  // ── 0. Cover block ──────────────────────────────────────────────────────
  // Written before the columns are defined so the header row lands underneath
  // it. `headerOffset` is how many rows everything below shifts by.
  const coverLines: { text: string; style: 'title' | 'sub' | 'meta' }[] = [];
  if (meta?.hospital) coverLines.push({ text: meta.hospital, style: 'meta' });
  if (meta?.title) coverLines.push({ text: meta.title, style: 'title' });
  if (meta?.subtitle) coverLines.push({ text: meta.subtitle, style: 'sub' });
  if (meta?.filters) coverLines.push({ text: meta.filters, style: 'meta' });
  coverLines.push({
    text: `Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
      + (meta?.generatedBy ? ` · By: ${meta.generatedBy}` : '')
      + ` · Rows: ${rows.length}`,
    style: 'meta',
  });

  const lastColLetter = (n: number) => {
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };
  const lastCol = lastColLetter(columns.length);

  coverLines.forEach((line, i) => {
    const r = i + 1;
    sheet.mergeCells(`A${r}:${lastCol}${r}`);
    const cell = sheet.getCell(`A${r}`);
    cell.value = line.text;
    if (line.style === 'title') cell.font = { bold: true, size: 14 };
    else if (line.style === 'sub') cell.font = { size: 11, color: { argb: 'FF444444' } };
    else cell.font = { size: 10, color: { argb: 'FF666666' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  // Blank spacer row between the cover block and the table.
  const headerOffset = coverLines.length + 1;

  // ── 1. Define columns ───────────────────────────────────────────────────
  // Widths are computed from the actual content below, so long values (reasons,
  // patient names, JSON details) are not cut off when the file is opened.
  sheet.columns = columns.map((col) => ({
    key: col.key,
    width: col.type === 'currency' ? 20 : col.type === 'date' ? 14 : 18,
  }));

  // ── 2. Header row, placed under the cover block ─────────────────────────
  const headerRow = sheet.getRow(headerOffset);
  headerRow.values = columns.map((c) => c.label);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1B5E20' }, // dark green — matches the HospitalOS theme
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 24;
  headerRow.commit?.();

  // Keep the header visible when scrolling a long report.
  sheet.views = [{ state: 'frozen', ySplit: headerOffset }];
  sheet.autoFilter = { from: { row: headerOffset, column: 1 }, to: { row: headerOffset, column: columns.length } };

  // ── 3. Add data rows ───────────────────────────────────────────────────

  rows.forEach((row, i) => {
    const values: Record<string, any> = {};
    for (const col of columns) {
      let value = row[col.key];

      // Format dates as YYYY-MM-DD strings so Excel doesn't mangle them
      if (col.type === 'date' && value) {
        value = new Date(value).toISOString().split('T')[0];
      }

      // Say "not recorded" for missing text, matching what the on-screen
      // report shows. A blank cell reads as "nobody filled this in yet";
      // it should read the same in the file as it does in the app.
      if ((value === null || value === undefined || value === '') && col.type === 'string') {
        value = 'not recorded';
      }

      values[col.key] = value;
    }
    const r = sheet.addRow(values);
    // Banded rows — a wall of identical white rows is hard to read across.
    if (i % 2 === 1) {
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9F7' } };
    }
    r.alignment = { vertical: 'top', wrapText: true };
    r.border = { bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } } };
  });

  // ── 4. Apply number formatting to currency & number columns ────────────
  columns.forEach((col, idx) => {
    const colNumber = idx + 1; // ExcelJS columns are 1-indexed
    if (col.type === 'currency') {
      sheet.getColumn(colNumber).numFmt = '₹#,##0.00';
    } else if (col.type === 'number') {
      sheet.getColumn(colNumber).numFmt = '#,##0';
    } else if (col.type === 'percent') {
      // Values are already scaled to 0–100, so use a literal "%" (NOT Excel's
      // `0.0%` which would multiply by 100 again).
      sheet.getColumn(colNumber).numFmt = '0.0"%"';
    }
  });

  // ── 5. Append a totals row at the bottom ───────────────────────────────
  const totalsValues: Record<string, any> = {};
  for (const col of columns) {
    if (col.total && totals[col.key] !== undefined) {
      totalsValues[col.key] = totals[col.key];
    } else if (col.key === columns[0].key) {
      // Put "TOTAL" label in the first column
      totalsValues[col.key] = 'TOTAL';
    } else {
      totalsValues[col.key] = '';
    }
  }

  const totalsRow = sheet.addRow(totalsValues);
  totalsRow.font = { bold: true, size: 11 };
  totalsRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F8E9' }, // light green background
  };

  // ── 6. Fit each column to its widest value ─────────────────────────────
  // Capped so one very long free-text cell (a cancellation reason, a JSON
  // details blob) doesn't push the sheet metres wide; those wrap instead.
  const MIN_W = 12, MAX_W = 60;
  columns.forEach((col, idx) => {
    const column = sheet.getColumn(idx + 1);
    let widest = String(col.label ?? '').length;
    for (const row of rows) {
      const v = row[col.key];
      if (v === null || v === undefined) continue;
      const len = String(v).length;
      if (len > widest) widest = len;
    }
    column.width = Math.min(MAX_W, Math.max(MIN_W, widest + 2));
    if (widest + 2 > MAX_W) column.alignment = { wrapText: true, vertical: 'top' };
  });

  // ── 7. Write to buffer ─────────────────────────────────────────────────
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
