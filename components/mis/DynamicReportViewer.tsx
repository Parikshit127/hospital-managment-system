/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React, { useState } from 'react';
import { generateReport, exportReportToExcel } from '@/app/actions/mis-report-actions';
import { Play, Download, Loader2, Info, Calendar } from 'lucide-react';

interface ColumnDef {
  key: string;
  label: string;
  type: string;
  total?: string;
}

interface DynamicReportViewerProps {
  reportId: string;
  reportDescription?: string;
  columns?: ColumnDef[];
}

export function DynamicReportViewer({ reportId, reportDescription, columns }: DynamicReportViewerProps) {
  const [filters, setFilters] = useState({
    date_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date_end: new Date().toISOString().split('T')[0]
  });

  const [data, setData] = useState<{ rows: any[], totals: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [jobId, setJobId] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setIsQueued(false);
    setData(null);
    try {
      const result = await generateReport(reportId, filters);
      if (result.async) {
        setIsQueued(true);
        setJobId(result.jobId || '');
      } else {
        setData({ rows: result.rows || [], totals: result.totals || {} });
      }
    } catch (error: any) {
      alert(error.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportReportToExcel(reportId, filters);

      // 1. Handle the Background Job Scenario
      if ('async' in result && result.async) {
        setIsQueued(true);
        // Cast as any to bypass strict union checks for jobId
        setJobId((result as any).jobId || '');
        return;
      }

      // 2. Handle the Instant Download Scenario
      // Explicitly checking properties forces TypeScript to accept them
      if ('base64' in result && 'filename' in result) {
        const base64Data = result.base64 as string;
        const fileName = result.filename as string;

        const binaryString = window.atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error: any) {
      alert(error.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const formatValue = (val: any, type: string) => {
    if (val === null || val === undefined) return '—';
    if (type === 'currency') return `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (type === 'date') return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (type === 'number') return Number(val).toLocaleString('en-IN');
    return val.toString();
  };

  const activeColumns = columns || (data?.rows?.[0] ? Object.keys(data.rows[0]).map(k => ({ key: k, label: k.replace(/_/g, ' '), type: 'string' })) : []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-5">
        {reportDescription && <p className="text-sm text-gray-500 font-medium mb-5">{reportDescription}</p>}

        <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Start Date</label>
            <div className="relative group w-44">
              <input
                type="date"
                required
                value={filters.date_start}
                onChange={e => setFilters(f => ({ ...f, date_start: e.target.value }))}
                onClick={(e) => {
                  try { e.currentTarget.showPicker(); } catch {}
                }}
                className="w-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl pl-10 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover:border-indigo-300 hover:shadow-md cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-datetime-edit]:py-0"
              />
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400 group-hover:text-indigo-600 transition-colors pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">End Date</label>
            <div className="relative group w-44">
              <input
                type="date"
                required
                value={filters.date_end}
                onChange={e => setFilters(f => ({ ...f, date_end: e.target.value }))}
                onClick={(e) => {
                  try { e.currentTarget.showPicker(); } catch {}
                }}
                className="w-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl pl-10 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover:border-indigo-300 hover:shadow-md cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-datetime-edit]:py-0"
              />
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400 group-hover:text-indigo-600 transition-colors pointer-events-none" />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed ml-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Generate
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || loading || isQueued}
            className="flex items-center gap-2 bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 font-bold text-sm px-6 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Excel
          </button>
        </form>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mb-4" />
          <p className="text-gray-500 font-medium">Crunching report data...</p>
        </div>
      )}

      {!loading && isQueued && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-8 text-center shadow-sm">
          <Info className="h-10 w-10 text-indigo-500 mx-auto mb-4" />
          <h3 className="text-lg font-black text-indigo-900 mb-2">Report Queued for Background Processing</h3>
          <p className="text-indigo-700 font-medium max-w-lg mx-auto">
            This report contains too much data for an instant response. It has been safely dispatched to our background worker.
          </p>
          <div className="mt-5 inline-block bg-white px-4 py-2 rounded-lg border border-indigo-100 shadow-sm text-sm font-mono text-indigo-600 font-bold">
            Job ID: {jobId}
          </div>
        </div>
      )}

      {!loading && !isQueued && data && data.rows && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {data.rows.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <p className="font-medium">No results found for the selected date range.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                  <tr>
                    {activeColumns.map((col: any) => (
                      <th key={col.key} className={`px-6 py-4 ${col.type === 'currency' || col.type === 'number' ? 'text-right' : ''}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      {activeColumns.map((col: any) => (
                        <td key={col.key} className={`px-6 py-4 font-medium text-gray-900 ${col.type === 'currency' || col.type === 'number' ? 'text-right' : ''}`}>
                          {formatValue(row[col.key], col.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {data.totals && Object.keys(data.totals).length > 0 && (
                  <tfoot className="bg-indigo-50/50 border-t border-indigo-100">
                    <tr>
                      {activeColumns.map((col: any, i: number) => {
                        const isTotalCol = col.key in data.totals;
                        const rawVal = data.totals[col.key];
                        const valString = (rawVal !== undefined && rawVal !== null) ? formatValue(rawVal, col.type) : '';

                        return (
                          <td key={col.key} className={`px-6 py-4 font-black text-indigo-900 ${col.type === 'currency' || col.type === 'number' ? 'text-right' : ''}`}>
                            {i === 0 ? 'TOTALS' : isTotalCol ? valString : ''}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
