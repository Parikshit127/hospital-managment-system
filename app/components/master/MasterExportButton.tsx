'use client';

import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

// Fields that are internal plumbing — never useful in an exported master sheet.
const DEFAULT_EXCLUDE = [
  'id', 'organizationId', 'password', 'password_hash',
  'createdAt', 'updatedAt', 'created_at', 'updated_at',
];

// snake_case / camelCase field name -> readable column header.
function prettify(key: string): string {
  if (key === 'is_active') return 'Status';
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function cell(key: string, v: unknown): string | number {
  if (key === 'is_active') return v ? 'Active' : 'Inactive';
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number;
}

interface Props {
  /** Base file name, e.g. "doctors" -> doctors-2026-07-03.xlsx */
  filename: string;
  sheetName?: string;
  /** Returns ALL rows to export (call the list action with a large limit). */
  fetchRows: () => Promise<Record<string, unknown>[]>;
  /** Extra field keys to drop from the export, on top of DEFAULT_EXCLUDE. */
  exclude?: string[];
}

/**
 * A drop-in "Export" button for the Master Data lists (Doctors / Services /
 * Medicines). Fetches every row, derives readable headers from the row fields
 * and downloads a .xlsx — matching the look of the existing Template/Import
 * buttons. Column layout mirrors the import template so an export can be edited
 * and re-imported.
 */
export default function MasterExportButton({ filename, sheetName = 'Data', fetchRows, exclude = [] }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const rows = await fetchRows();
      if (!rows || rows.length === 0) {
        toast.error('Nothing to export.');
        return;
      }
      const skip = new Set([...DEFAULT_EXCLUDE, ...exclude]);
      const keys = Object.keys(rows[0]).filter(k => !skip.has(k));
      const headers = keys.map(prettify);

      const data = rows.map(r => {
        const o: Record<string, string | number> = {};
        keys.forEach((k, i) => { o[headers[i]] = cell(k, r[k]); });
        return o;
      });

      const ws = XLSX.utils.json_to_sheet(data, { header: headers });
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 14) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${filename}-${ts}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} row${rows.length !== 1 ? 's' : ''}.`);
    } catch (e: any) {
      toast.error('Export failed: ' + (e?.message || 'unknown error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {busy ? 'Exporting…' : 'Export'}
    </button>
  );
}
