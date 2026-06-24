import ExcelJS from 'exceljs';
import { ColumnSpec } from './types';

/**
 * Generates a .xlsx Buffer from report data.
 *
 * @param columns  – Column definitions from the report registry (key, label, type, total)
 * @param rows     – Data rows returned by the report queryFn
 * @param totals   – Aggregated totals object (e.g. { billed_amount: 5225457, ... })
 * @returns A Node.js Buffer containing the binary .xlsx file
 */
export async function generateExcelBuffer(
  columns: ColumnSpec[],
  rows: Record<string, any>[],
  totals: Record<string, number>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HospitalOS MIS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Report');

  // ── 1. Define columns (header row) ──────────────────────────────────────
  sheet.columns = columns.map((col) => ({
    header: col.label,
    key: col.key,
    width: col.type === 'currency' ? 20 : col.type === 'date' ? 14 : 18,
  }));

  // ── 2. Style the header row ─────────────────────────────────────────────
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1B5E20' }, // dark green — matches the HospitalOS theme
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  // ── 3. Add data rows ───────────────────────────────────────────────────
  for (const row of rows) {
    const values: Record<string, any> = {};
    for (const col of columns) {
      let value = row[col.key];

      // Format dates as YYYY-MM-DD strings so Excel doesn't mangle them
      if (col.type === 'date' && value) {
        value = new Date(value).toISOString().split('T')[0];
      }

      values[col.key] = value;
    }
    sheet.addRow(values);
  }

  // ── 4. Apply number formatting to currency & number columns ────────────
  columns.forEach((col, idx) => {
    const colNumber = idx + 1; // ExcelJS columns are 1-indexed
    if (col.type === 'currency') {
      sheet.getColumn(colNumber).numFmt = '₹#,##0.00';
    } else if (col.type === 'number') {
      sheet.getColumn(colNumber).numFmt = '#,##0';
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

  // ── 6. Write to buffer ─────────────────────────────────────────────────
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
