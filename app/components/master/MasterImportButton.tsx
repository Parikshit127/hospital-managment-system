'use client';

import React, { useRef, useState } from 'react';
import { Upload, Download, Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { parseFile } from '@/app/lib/import/parser';
import { validateMasterRows } from '@/app/lib/import/master-validators';
import { downloadMasterTemplate } from '@/app/lib/import/master-templates';
import { importMasterData } from '@/app/actions/master-import-actions';
import type { MasterImportType, RowError } from '@/app/lib/import/master-validators';
import type { ImportRowFailure } from '@/app/actions/master-import-actions';

const MAX_ROWS = 500;

interface Props {
  type: MasterImportType;
  onImportComplete: () => void;
}

type Stage = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';

interface PreviewState {
  totalRows: number;
  previewRows: Record<string, unknown>[];
  validCount: number;
  errors: RowError[];
  validRows: Record<string, unknown>[];
}

export default function MasterImportButton({ type, onImportComplete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; failed: ImportRowFailure[] } | null>(null);
  const [validationErrors, setValidationErrors] = useState<RowError[]>([]);

  function handleTemplateDownload() {
    try {
      downloadMasterTemplate(type);
    } catch (e: any) {
      toast.error('Failed to generate template: ' + e.message);
    }
  }

  async function handleFile(file: File) {
    setStage('parsing');
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseFile(buffer, file.name);

      if (parsed.totalRows > MAX_ROWS) {
        toast.error(`File has ${parsed.totalRows} rows. Maximum is ${MAX_ROWS}.`);
        setStage('idle');
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      const { valid, errors } = validateMasterRows(type, parsed.data as Record<string, unknown>[]);

      setPreview({
        totalRows: parsed.totalRows,
        previewRows: (valid as unknown as Record<string, unknown>[]).slice(0, 5),
        validCount: valid.length,
        errors,
        validRows: valid as unknown as Record<string, unknown>[],
      });
      setValidationErrors(errors);
      setStage('preview');
    } catch (e: any) {
      toast.error('Could not read file: ' + e.message);
      setStage('idle');
    }
    // reset file input so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleProceed() {
    if (!preview || preview.validCount === 0) return;
    setStage('importing');
    const res = await importMasterData(type, preview.validRows);
    if (!res.success) {
      toast.error(res.error || 'Import failed');
      setStage('preview');
      return;
    }
    setImportResult(res.data!);
    setStage('done');
    if (res.data!.imported > 0) {
      toast.success(`Imported ${res.data!.imported} rows successfully`);
      onImportComplete();
    }
  }

  function handleErrorReportDownload() {
    if (!importResult || importResult.failed.length === 0) return;
    const firstRow = importResult.failed[0]?.originalData ?? {};
    const dataKeys = Object.keys(firstRow);
    const headers = ['Row', 'Error', ...dataKeys];
    const rows = importResult.failed.map(f => ({
      Row: f.rowIndex,
      Error: f.reason,
      ...f.originalData,
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 15) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-import-errors.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleValidationErrorDownload() {
    if (validationErrors.length === 0) return;
    const firstRow = validationErrors[0]?.originalData ?? {};
    const dataKeys = Object.keys(firstRow);
    const headers = ['Row', 'Error', ...dataKeys];
    const rows = validationErrors.map(e => ({
      Row: e.rowIndex,
      Error: e.reason,
      ...e.originalData,
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 15) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Validation Errors');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-validation-errors.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function close() {
    setStage('idle');
    setPreview(null);
    setImportResult(null);
    setValidationErrors([]);
  }

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleTemplateDownload}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50"
        >
          <Download className="h-4 w-4" /> Template
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={stage === 'parsing' || stage === 'importing'}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50"
        >
          {(stage === 'parsing' || stage === 'importing') ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {stage === 'parsing' ? 'Reading…' : stage === 'importing' ? 'Importing…' : 'Import'}
        </button>
      </div>

      {/* Modal — preview or done */}
      {(stage === 'preview' || stage === 'done') && preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                {stage === 'done' ? 'Import Complete' : `Preview — ${preview.validCount} of ${preview.totalRows} rows valid`}
              </h2>
              <button onClick={close} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Validation error summary */}
            {preview.errors.length > 0 && stage === 'preview' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      {preview.errors.length} row{preview.errors.length > 1 ? 's' : ''} will be skipped (validation errors):
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-700 max-h-24 overflow-y-auto">
                      {preview.errors.slice(0, 10).map((e, idx) => (
                        <li key={idx}>Row {e.rowIndex}: {e.reason}</li>
                      ))}
                      {preview.errors.length > 10 && <li>…and {preview.errors.length - 10} more</li>}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {preview.errors.length > 10 && stage === 'preview' && (
              <div className="mb-4 flex justify-end">
                <button
                  onClick={handleValidationErrorDownload}
                  className="flex items-center gap-1.5 text-xs text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-50"
                >
                  <Download className="h-3.5 w-3.5" /> Download all {validationErrors.length} validation errors
                </button>
              </div>
            )}

            {/* Import result summary */}
            {stage === 'done' && importResult && (
              <div className={`mb-4 p-3 rounded-xl border ${importResult.failed.length === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`h-4 w-4 ${importResult.failed.length > 0 ? 'text-amber-600' : 'text-green-600'}`} />
                  <p className="text-sm font-semibold text-green-800">
                    {importResult.imported} row{importResult.imported !== 1 ? 's' : ''} imported
                    {importResult.failed.length > 0 && `, ${importResult.failed.length} failed`}
                  </p>
                </div>
              </div>
            )}

            {/* Preview table — first 5 valid rows */}
            {preview.previewRows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-200 mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {Object.keys(preview.previewRows[0]).map(k => (
                        <th key={k} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.previewRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 text-gray-700 max-w-[140px] truncate">{String(v ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.validCount > 5 && (
                  <p className="text-xs text-center text-gray-400 py-2 border-t border-gray-100">
                    Showing 5 of {preview.validCount} valid rows
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {stage === 'done' && importResult && importResult.failed.length > 0 && (
                <button
                  onClick={handleErrorReportDownload}
                  className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 text-sm font-semibold rounded-xl hover:bg-red-50"
                >
                  <Download className="h-4 w-4" /> Download Error Report
                </button>
              )}
              <div className="flex-1" />
              <button onClick={close} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50">
                {stage === 'done' ? 'Close' : 'Cancel'}
              </button>
              {stage === 'preview' && (
                <button
                  onClick={handleProceed}
                  disabled={preview.validCount === 0}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                >
                  Import {preview.validCount} row{preview.validCount !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
