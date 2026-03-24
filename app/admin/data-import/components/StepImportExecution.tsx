'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Loader2, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { executeImportBatch, cancelImport } from '@/app/actions/import-actions';
import { CHUNK_SIZE } from '@/app/lib/import/chunked-processor';

interface Props {
    jobId: string;
    totalRows: number;
    onComplete: () => void;
    onBack: () => void;
}

export default function StepImportExecution({ jobId, totalRows, onComplete, onBack }: Props) {
    const [running, setRunning] = useState(false);
    const [cancelled, setCancelled] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [currentRow, setCurrentRow] = useState(0);
    const [successful, setSuccessful] = useState(0);
    const [failed, setFailed] = useState(0);
    const [error, setError] = useState('');
    const [logs, setLogs] = useState<string[]>([]);

    const percent = totalRows > 0 ? Math.round((currentRow / totalRows) * 100) : 0;

    const addLog = useCallback((msg: string) => {
        setLogs(prev => [...prev.slice(-50), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    }, []);

    const runImport = useCallback(async () => {
        setRunning(true);
        addLog('Starting import...');

        let startRow = 0;
        let totalSuccess = 0;
        let totalFailed = 0;

        while (startRow < totalRows && !cancelled) {
            try {
                const res = await executeImportBatch(jobId, startRow);
                if (!res.success) {
                    setError(res.error || 'Batch failed');
                    addLog(`Error: ${res.error}`);
                    setRunning(false);
                    return;
                }

                const batch = res.result!;
                totalSuccess += batch.successful;
                totalFailed += batch.failed;
                setCurrentRow(batch.nextStartRow);
                setSuccessful(totalSuccess);
                setFailed(totalFailed);
                addLog(`Batch ${Math.ceil(batch.nextStartRow / CHUNK_SIZE)}: ${batch.successful} imported, ${batch.failed} failed`);

                if (batch.isComplete) {
                    setCompleted(true);
                    addLog(`Import complete! ${totalSuccess} records imported, ${totalFailed} failed.`);
                    setRunning(false);
                    return;
                }

                startRow = batch.nextStartRow;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Import failed');
                addLog(`Fatal error: ${err instanceof Error ? err.message : 'Unknown'}`);
                setRunning(false);
                return;
            }
        }

        if (cancelled) {
            addLog('Import cancelled by user.');
            setRunning(false);
        }
    }, [jobId, totalRows, cancelled, addLog]);

    // Auto-start import
    useEffect(() => {
        runImport();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleCancel() {
        setCancelled(true);
        await cancelImport(jobId);
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900">
                    {completed ? 'Import Complete' : running ? 'Importing Data...' : cancelled ? 'Import Cancelled' : 'Import'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                    {running ? `Processing ${totalRows.toLocaleString()} rows in batches of ${CHUNK_SIZE}` :
                     completed ? 'All batches processed successfully' :
                     'Import was stopped'}
                </p>
            </div>

            {/* Progress Bar */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Progress</span>
                    <span className="text-sm font-bold text-gray-900">{percent}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                        className={`h-3 rounded-full transition-all duration-300 ${
                            completed ? 'bg-emerald-500' :
                            cancelled ? 'bg-amber-500' :
                            'bg-blue-500'
                        }`}
                        style={{ width: `${percent}%` }}
                    />
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl text-center">
                    <p className="text-2xl font-bold text-gray-900">{currentRow.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Processed</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl text-center">
                    <p className="text-2xl font-bold text-emerald-600">{successful.toLocaleString()}</p>
                    <p className="text-xs text-emerald-600 mt-1">Imported</p>
                </div>
                <div className="p-4 bg-red-50 rounded-xl text-center">
                    <p className="text-2xl font-bold text-red-600">{failed.toLocaleString()}</p>
                    <p className="text-xs text-red-600 mt-1">Failed</p>
                </div>
            </div>

            {/* Activity Log */}
            <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Activity Log</h4>
                <div className="bg-gray-900 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs text-gray-300 space-y-0.5">
                    {logs.map((log, i) => (
                        <div key={i}>{log}</div>
                    ))}
                    {running && (
                        <div className="flex items-center gap-2 text-blue-400">
                            <Loader2 size={12} className="animate-spin" />
                            Processing...
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t border-gray-200">
                {!completed && !cancelled ? (
                    <>
                        <button onClick={onBack} disabled={running} className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-30">
                            <ChevronLeft size={16} /> Back
                        </button>
                        <button
                            onClick={handleCancel}
                            disabled={!running}
                            className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 text-sm font-medium rounded-xl hover:bg-red-200 disabled:opacity-50"
                        >
                            <Ban size={16} /> Cancel Import
                        </button>
                    </>
                ) : (
                    <div className="flex-1 flex justify-end">
                        <button
                            onClick={onComplete}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
                        >
                            {completed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                            View Results
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
