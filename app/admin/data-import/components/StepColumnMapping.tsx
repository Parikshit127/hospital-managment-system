'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { getTemplate } from '@/app/lib/import/templates';
import { saveColumnMapping } from '@/app/actions/import-actions';
import type { ImportType, ColumnMapping, ImportColumn } from '@/app/types/import';

interface Props {
    importType: ImportType;
    headers: string[];
    previewRows: Record<string, string>[];
    mapping: ColumnMapping;
    jobId: string;
    onComplete: (mapping: ColumnMapping) => void;
    onBack: () => void;
}

export default function StepColumnMapping({ importType, headers, previewRows, mapping: initialMapping, jobId, onComplete, onBack }: Props) {
    const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const template = getTemplate(importType);
    const targetColumns = template.columns;
    const mappedTargets = new Set(Object.values(mapping).map(m => m.targetField));
    const requiredColumns = targetColumns.filter(c => c.required);
    const missingRequired = requiredColumns.filter(c => !mappedTargets.has(c.name));

    function updateMapping(sourceCol: string, targetField: string) {
        setMapping(prev => {
            const updated = { ...prev };
            if (!targetField) {
                delete updated[sourceCol];
            } else {
                // Remove any existing mapping to this target
                for (const key of Object.keys(updated)) {
                    if (updated[key].targetField === targetField) {
                        delete updated[key];
                    }
                }
                updated[sourceCol] = { targetField, confidence: 1, autoDetected: false };
            }
            return updated;
        });
    }

    async function handleSubmit() {
        if (missingRequired.length > 0) {
            setError(`Please map required columns: ${missingRequired.map(c => c.name).join(', ')}`);
            return;
        }
        setSaving(true);
        setError('');
        try {
            const result = await saveColumnMapping(jobId, mapping);
            if (!result.success) {
                setError(result.error || 'Failed to save mapping');
                return;
            }
            onComplete(mapping);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save mapping');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900">Column Mapping</h3>
                <p className="text-sm text-gray-500 mt-1">
                    Map your file columns to the system fields. Auto-detected mappings are shown — adjust as needed.
                </p>
            </div>

            {/* Missing required alert */}
            {missingRequired.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">
                        Required columns not mapped: <strong>{missingRequired.map(c => c.name).join(', ')}</strong>
                    </p>
                </div>
            )}

            {/* Mapping Table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-4 py-3 font-medium text-gray-600">Your Column</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-600">Preview</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-600">Maps To</th>
                            <th className="text-center px-4 py-3 font-medium text-gray-600 w-16">Match</th>
                        </tr>
                    </thead>
                    <tbody>
                        {headers.map(header => {
                            const mapped = mapping[header];
                            const previewValue = previewRows[0]?.[header] || '';
                            return (
                                <tr key={header} className="border-b border-gray-100 last:border-0">
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-gray-800">{header}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-gray-500 text-xs truncate block max-w-[150px]">{previewValue}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={mapped?.targetField || ''}
                                            onChange={(e) => updateMapping(header, e.target.value)}
                                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                                        >
                                            <option value="">— Ignore this column —</option>
                                            {targetColumns.map(col => (
                                                <option
                                                    key={col.name}
                                                    value={col.name}
                                                    disabled={mappedTargets.has(col.name) && mapped?.targetField !== col.name}
                                                >
                                                    {col.name} {col.required ? '*' : ''} — {col.description}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {mapped ? (
                                            mapped.confidence >= 0.8 ? (
                                                <CheckCircle2 size={18} className="text-emerald-500 mx-auto" />
                                            ) : (
                                                <span className="text-xs text-amber-600 font-medium">{Math.round(mapped.confidence * 100)}%</span>
                                            )
                                        ) : (
                                            <span className="text-gray-300">—</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Target fields legend */}
            <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-medium text-gray-600 mb-2">System Fields (* = required):</p>
                <div className="flex flex-wrap gap-1.5">
                    {targetColumns.map(col => (
                        <span
                            key={col.name}
                            className={`px-2 py-0.5 text-xs rounded-full ${
                                mappedTargets.has(col.name)
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : col.required
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-200 text-gray-600'
                            }`}
                        >
                            {col.name}{col.required ? ' *' : ''}
                        </span>
                    ))}
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t border-gray-200">
                <button onClick={onBack} className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                    <ChevronLeft size={16} /> Back
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={saving || missingRequired.length > 0}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                    Validate Data
                </button>
            </div>
        </div>
    );
}
