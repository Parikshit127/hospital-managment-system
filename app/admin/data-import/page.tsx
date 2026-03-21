'use client';

import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, PlayCircle, BarChart3 } from 'lucide-react';
import StepFileUpload from './components/StepFileUpload';
import StepColumnMapping from './components/StepColumnMapping';
import StepValidationPreview from './components/StepValidationPreview';
import StepImportExecution from './components/StepImportExecution';
import StepResults from './components/StepResults';
import type { ImportType, ColumnMapping, ValidationResult } from '@/app/types/import';

const STEPS = [
    { label: 'Upload', icon: Upload },
    { label: 'Map Columns', icon: FileSpreadsheet },
    { label: 'Validate', icon: AlertTriangle },
    { label: 'Import', icon: PlayCircle },
    { label: 'Results', icon: BarChart3 },
];

export default function DataImportPage() {
    const [step, setStep] = useState(0);

    // Shared state across steps
    const [importType, setImportType] = useState<ImportType>('patients');
    const [jobId, setJobId] = useState<string>('');
    const [headers, setHeaders] = useState<string[]>([]);
    const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const [mapping, setMapping] = useState<ColumnMapping>({});
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

    function handleUploadComplete(data: {
        importType: ImportType;
        jobId: string;
        headers: string[];
        previewRows: Record<string, string>[];
        totalRows: number;
        autoMapping: ColumnMapping;
    }) {
        setImportType(data.importType);
        setJobId(data.jobId);
        setHeaders(data.headers);
        setPreviewRows(data.previewRows);
        setTotalRows(data.totalRows);
        setMapping(data.autoMapping);
        setStep(1);
    }

    function handleMappingComplete(finalMapping: ColumnMapping) {
        setMapping(finalMapping);
        setStep(2);
    }

    function handleValidationComplete(result: ValidationResult) {
        setValidationResult(result);
        setStep(3);
    }

    function handleImportComplete() {
        setStep(4);
    }

    function handleStartOver() {
        setStep(0);
        setJobId('');
        setHeaders([]);
        setPreviewRows([]);
        setTotalRows(0);
        setMapping({});
        setValidationResult(null);
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Data Import</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Import patient records, staff data, invoices, and more from CSV or Excel files
                </p>
            </div>

            {/* Step Indicator */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                    {STEPS.map((s, i) => {
                        const Icon = s.icon;
                        const isActive = i === step;
                        const isCompleted = i < step;
                        return (
                            <div key={s.label} className="flex items-center flex-1">
                                <div className="flex items-center gap-2">
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                                        isCompleted ? 'bg-emerald-100 text-emerald-600' :
                                        isActive ? 'bg-blue-100 text-blue-600' :
                                        'bg-gray-100 text-gray-400'
                                    }`}>
                                        {isCompleted ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                                    </div>
                                    <span className={`text-sm font-medium hidden sm:block ${
                                        isActive ? 'text-gray-900' :
                                        isCompleted ? 'text-emerald-600' :
                                        'text-gray-400'
                                    }`}>
                                        {s.label}
                                    </span>
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div className={`flex-1 h-px mx-3 ${
                                        i < step ? 'bg-emerald-300' : 'bg-gray-200'
                                    }`} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Step Content */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                {step === 0 && (
                    <StepFileUpload onComplete={handleUploadComplete} />
                )}
                {step === 1 && (
                    <StepColumnMapping
                        importType={importType}
                        headers={headers}
                        previewRows={previewRows}
                        mapping={mapping}
                        jobId={jobId}
                        onComplete={handleMappingComplete}
                        onBack={() => setStep(0)}
                    />
                )}
                {step === 2 && (
                    <StepValidationPreview
                        jobId={jobId}
                        importType={importType}
                        totalRows={totalRows}
                        onComplete={handleValidationComplete}
                        onBack={() => setStep(1)}
                    />
                )}
                {step === 3 && (
                    <StepImportExecution
                        jobId={jobId}
                        totalRows={totalRows}
                        onComplete={handleImportComplete}
                        onBack={() => setStep(2)}
                    />
                )}
                {step === 4 && (
                    <StepResults
                        jobId={jobId}
                        importType={importType}
                        onStartOver={handleStartOver}
                    />
                )}
            </div>
        </div>
    );
}
