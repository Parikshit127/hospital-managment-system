'use client';

import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { getTemplateHeaders } from '@/app/lib/import/templates';
import type { MasterImportType } from '@/app/lib/import/master-validators';

// Format a value for the sheet so the file round-trips through the importer:
// booleans as the 'true'/'false' the validator's parseBool expects, blanks for
// missing fields (e.g. password, which is never exported).
function cell(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number;
}

interface Props {
  /** Master type — drives the exact column set, matching the import template. */
  type: MasterImportType;
  /** Base file name, e.g. "doctors" -> doctors-2026-07-03.xlsx */
  filename: string;
  sheetName?: string;
  /** Returns ALL rows to export (call the list action with a large limit). */
  fetchRows: () => Promise<Record<string, unknown>[]>;
}

/**
 * "Export" button for the Master Data lists. It writes exactly the same columns
 * (and in the same order) as the import template for `type`, so an exported file
 * can be edited and re-imported without column-mismatch errors. DB field names
 * already match the template column names, so each cell is a direct lookup.
 */
export default function MasterExportButton({ type, filename, sheetName = 'Data', fetchRows }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const rows = await fetchRows();
      if (!rows || rows.length === 0) {
        toast.error('Nothing to export.');
        return;
      }

      // Use the import template's headers verbatim so export === import format.
      const headers = getTemplateHeaders(type as any);
      const data = rows.map(r => {
        const o: Record<string, string | number> = {};
        for (const h of headers) o[h] = cell((r as Record<string, unknown>)[h]);
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
