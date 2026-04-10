'use client';

import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, Loader2, Users, Stethoscope, Receipt, FlaskConical, Pill, CalendarDays, Database } from 'lucide-react';
import type { ImportType, ColumnMapping } from '@/app/types/import';
import { createImportJob } from '@/app/actions/import-actions';

const IMPORT_TYPES: { value: ImportType; label: string; icon: React.ElementType; description: string }[] = [
    { value: 'patients', label: 'Patient Records', icon: Users, description: 'Demographics, contact info, medical history' },
    { value: 'staff', label: 'Staff & Doctors', icon: Stethoscope, description: 'Staff accounts with roles and specialties' },
    { value: 'invoices', label: 'Invoices & Billing', icon: Receipt, description: 'Historical invoices and payment records' },
    { value: 'lab_results', label: 'Lab Results', icon: FlaskConical, description: 'Laboratory test orders and results' },
    { value: 'pharmacy', label: 'Pharmacy Inventory', icon: Pill, description: 'Medicine catalog and batch inventory' },
    { value: 'appointments', label: 'Appointments', icon: CalendarDays, description: 'Historical appointment records' },
    { value: 'doctor_master' as ImportType, label: 'Doctor Master', icon: Database, description: 'Bulk import doctors with fees and specialization' },
    { value: 'service_master' as ImportType, label: 'Service Master', icon: Database, description: 'Bulk import services (ICU, procedures, nursing)' },
    { value: 'lab_test_master' as ImportType, label: 'Lab Test Master', icon: Database, description: 'Bulk import lab test catalog with prices' },
    { value: 'package_master' as ImportType, label: 'Package Master', icon: Database, description: 'Bulk import treatment packages' },
    { value: 'medicine_master' as ImportType, label: 'Medicine Master', icon: Database, description: 'Bulk import medicine catalog with pricing' },
];

interface Props {
    onComplete: (data: {
        importType: ImportType;
        jobId: string;
        headers: string[];
        previewRows: Record<string, string>[];
        totalRows: number;
        autoMapping: ColumnMapping;
    }) => void;
}

export default function StepFileUpload({ onComplete }: Props) {
    const [selectedType, setSelectedType] = useState<ImportType>('patients');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function handleFile(file: File) {
        setError('');
        setUploading(true);

        try {
            // Upload and parse file
            const formData = new FormData();
            formData.append('file', file);
            formData.append('importType', selectedType);

            const response = await fetch('/api/import/upload', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            if (!result.success) {
                setError(result.error || 'Upload failed');
                setUploading(false);
                return;
            }

            // Create import job with parsed data
            const jobResult = await createImportJob(
                selectedType,
                result.fileName,
                result.fileSize,
                result.totalRows,
                result.headers,
                result.data,
            );

            if (!jobResult.success) {
                setError('Failed to create import job');
                setUploading(false);
                return;
            }

            onComplete({
                importType: selectedType,
                jobId: jobResult.jobId!,
                headers: result.headers,
                previewRows: result.previewRows,
                totalRows: result.totalRows,
                autoMapping: jobResult.autoMapping as ColumnMapping,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }

    return (
        <div className="space-y-6">
            {/* Import Type Selection */}
            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">1. Select Data Type</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {IMPORT_TYPES.map(type => {
                        const Icon = type.icon;
                        const isSelected = selectedType === type.value;
                        return (
                            <button
                                key={type.value}
                                onClick={() => setSelectedType(type.value)}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${
                                    isSelected
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                            >
                                <Icon size={20} className={isSelected ? 'text-blue-600' : 'text-gray-400'} />
                                <p className={`text-sm font-medium mt-2 ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>
                                    {type.label}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">{type.description}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Template Download */}
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <FileSpreadsheet size={20} className="text-amber-600 shrink-0" />
                <div className="flex-1">
                    <p className="text-sm font-medium text-amber-900">Need a template?</p>
                    <p className="text-xs text-amber-700">Download a pre-formatted template with all the required columns.</p>
                </div>
                <a
                    href={`/api/import/template/${selectedType}`}
                    download
                    className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 flex items-center gap-1"
                >
                    <Download size={14} />
                    Download
                </a>
            </div>

            {/* File Upload Zone */}
            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">2. Upload File</h3>
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                        dragOver ? 'border-blue-500 bg-blue-50' :
                        'border-gray-300 hover:border-gray-400 bg-gray-50'
                    }`}
                >
                    {uploading ? (
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 size={36} className="text-blue-500 animate-spin" />
                            <p className="text-sm text-gray-600">Parsing file...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3">
                            <Upload size={36} className="text-gray-400" />
                            <div>
                                <p className="text-sm font-medium text-gray-700">
                                    Drag & drop your file here, or click to browse
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Supports CSV, XLSX, XLS (max 50MB)
                                </p>
                            </div>
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}
        </div>
    );
}
