'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, CheckCircle2, AlertTriangle, XCircle, Copy } from 'lucide-react';
import { validateImportJob, resolveDuplicates } from '@/app/actions/import-actions';
import type { ImportType, ValidationResult, DuplicateResolution } from '@/app/types/import';

interface Props {
    jobId: string;
    importType: ImportType;
    totalRows: number;
    onComplete: (result: ValidationResult) => void;
    onBack: () => void;
}

export default function StepValidationPreview({ jobId, importType, totalRows, onComplete, onBack }: Props) {
    const [loading, setLoading] = useState(true);
    const [result, setResult] = useState<ValidationResult | null>(null);
    const [error, setError] = useState('');
    const [errorPage, setErrorPage] = useState(0);
    const [savingDuplicates, setSavingDuplicates] = useState(false);
    const [duplicateResolutions, setDuplicateResolutions] = useState<Record<number, 'skip' | 'merge' | 'import'>>({});

    const ERRORS_PER_PAGE = 20;

    useEffect(() => {
        async function validate() {
            try {
                const res = await validateImportJob(jobId);
                if (res.success && res.result) {
                    setResult(res.result);
                    // Default: skip all duplicates
                    const defaultResolutions: Record<number, 'skip' | 'merge' | 'import'> = {};
                    for (const dup of res.result.duplicates) {
                        defaultResolutions[dup.importRow] = 'skip';
                    }
                    setDuplicateResolutions(defaultResolutions);
                } else {
                    setError(res.error || 'Validation failed');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Validation failed');
            } finally {
                setLoading(false);
            }
        }
        validate();
    }, [jobId]);

    async function handleProceed() {
        if (!result) return;

        // Save duplicate resolutions
        if (result.duplicates.length > 0) {
            setSavingDuplicates(true);
            const resolutions: DuplicateResolution[] = result.duplicates.map(d => ({
                importRow: d.importRow,
                resolution: duplicateResolutions[d.importRow] || 'skip',
            }));
            await resolveDuplicates(jobId, resolutions);
            setSavingDuplicates(false);
        }

        onComplete(result);
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={36} className="text-blue-500 animate-spin" />
                <p className="text-sm text-gray-600">Validating {totalRows.toLocaleString()} rows...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-4">
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
                <button onClick={onBack} className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600">
                    <ChevronLeft size={16} /> Back
                </button>
            </div>
        );
    }

    if (!result) return null;

    const paginatedErrors = result.errors.slice(
        errorPage * ERRORS_PER_PAGE,
        (errorPage + 1) * ERRORS_PER_PAGE,
    );
    const totalErrorPages = Math.ceil(result.errors.length / ERRORS_PER_PAGE);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900">Validation Results</h3>
                <p className="text-sm text-gray-500 mt-1">Review data quality before importing</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard label="Total Rows" value={result.summary.totalRows} icon={<Copy size={16} />} color="blue" />
                <SummaryCard label="Valid" value={result.summary.validRows} icon={<CheckCircle2 size={16} />} color="emerald" />
                <SummaryCard label="Errors" value={result.summary.errorRows} icon={<XCircle size={16} />} color="red" />
                <SummaryCard label="Warnings" value={result.summary.warningRows} icon={<AlertTriangle size={16} />} color="amber" />
                <SummaryCard label="Duplicates" value={result.summary.duplicateRows} icon={<Copy size={16} />} color="purple" />
            </div>

            {/* Quality Score */}
            <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Data Quality Score</span>
                    <span className={`text-lg font-bold ${
                        result.qualityScore >= 80 ? 'text-emerald-600' :
                        result.qualityScore >= 50 ? 'text-amber-600' : 'text-red-600'
                    }`}>{result.qualityScore}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full transition-all ${
                            result.qualityScore >= 80 ? 'bg-emerald-500' :
                            result.qualityScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${result.qualityScore}%` }}
                    />
                </div>
            </div>

            {/* Errors Table */}
            {result.errors.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">Errors ({result.errors.length})</h4>
                    <div className="border border-red-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-red-50 border-b border-red-200">
                                    <th className="text-left px-4 py-2 font-medium text-red-700 w-16">Row</th>
                                    <th className="text-left px-4 py-2 font-medium text-red-700">Field</th>
                                    <th className="text-left px-4 py-2 font-medium text-red-700">Value</th>
                                    <th className="text-left px-4 py-2 font-medium text-red-700">Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedErrors.map((err, i) => (
                                    <tr key={i} className="border-b border-red-100 last:border-0">
                                        <td className="px-4 py-2 text-gray-600">{err.row + 1}</td>
                                        <td className="px-4 py-2 font-medium text-gray-800">{err.field}</td>
                                        <td className="px-4 py-2 text-gray-500 max-w-[120px] truncate">{String(err.value ?? '')}</td>
                                        <td className="px-4 py-2 text-red-600">{err.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {totalErrorPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-t border-red-200">
                                <button
                                    onClick={() => setErrorPage(p => Math.max(0, p - 1))}
                                    disabled={errorPage === 0}
                                    className="text-xs text-red-600 disabled:text-red-300"
                                >Previous</button>
                                <span className="text-xs text-red-600">Page {errorPage + 1} of {totalErrorPages}</span>
                                <button
                                    onClick={() => setErrorPage(p => Math.min(totalErrorPages - 1, p + 1))}
                                    disabled={errorPage >= totalErrorPages - 1}
                                    className="text-xs text-red-600 disabled:text-red-300"
                                >Next</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Duplicates */}
            {result.duplicates.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">Duplicates ({result.duplicates.length})</h4>
                    <div className="border border-purple-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-purple-50 border-b border-purple-200">
                                    <th className="text-left px-4 py-2 font-medium text-purple-700 w-16">Row</th>
                                    <th className="text-left px-4 py-2 font-medium text-purple-700">Match Type</th>
                                    <th className="text-left px-4 py-2 font-medium text-purple-700">Matched On</th>
                                    <th className="text-left px-4 py-2 font-medium text-purple-700">Existing ID</th>
                                    <th className="text-left px-4 py-2 font-medium text-purple-700 w-32">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.duplicates.slice(0, 50).map((dup, i) => (
                                    <tr key={i} className="border-b border-purple-100 last:border-0">
                                        <td className="px-4 py-2 text-gray-600">{dup.importRow + 1}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                                                dup.matchType === 'exact' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                            }`}>{dup.matchType}</span>
                                        </td>
                                        <td className="px-4 py-2 text-gray-600">{dup.matchedFields.join(', ')}</td>
                                        <td className="px-4 py-2 text-gray-800 font-mono text-xs">{dup.existingRecord.patient_id || String(dup.existingRecord.id)}</td>
                                        <td className="px-4 py-2">
                                            <select
                                                value={duplicateResolutions[dup.importRow] || 'skip'}
                                                onChange={(e) => setDuplicateResolutions(prev => ({
                                                    ...prev,
                                                    [dup.importRow]: e.target.value as 'skip' | 'merge' | 'import',
                                                }))}
                                                className="text-xs px-2 py-1 border border-gray-200 rounded-lg"
                                            >
                                                <option value="skip">Skip</option>
                                                <option value="import">Import as New</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t border-gray-200">
                <button onClick={onBack} className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                    <ChevronLeft size={16} /> Back
                </button>
                <button
                    onClick={handleProceed}
                    disabled={savingDuplicates}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                    {savingDuplicates ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                    {result.errors.length > 0 ? 'Import Valid Rows' : 'Start Import'}
                </button>
            </div>
        </div>
    );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
    const colorClasses: Record<string, string> = {
        blue: 'bg-blue-50 text-blue-600 border-blue-200',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        red: 'bg-red-50 text-red-600 border-red-200',
        amber: 'bg-amber-50 text-amber-600 border-amber-200',
        purple: 'bg-purple-50 text-purple-600 border-purple-200',
    };
    return (
        <div className={`p-3 rounded-xl border ${colorClasses[color]}`}>
            <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-xs font-medium">{label}</span></div>
            <p className="text-xl font-bold">{value.toLocaleString()}</p>
        </div>
    );
}
