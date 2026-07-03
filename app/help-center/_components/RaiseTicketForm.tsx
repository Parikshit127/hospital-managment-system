'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TicketPriority } from '@prisma/client';
import { Send, ArrowLeft, CheckCircle2, AlertTriangle, UploadCloud, X, FileText, Loader2 } from 'lucide-react';
import { createTicket, saveTicketAttachment } from '@/app/actions/help-center-actions';
import { listBranches } from '@/app/actions/branch-actions';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { Card, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/Card';
import { Badge } from '@/app/components/ui/Badge';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// -------------------------------------------------
// Types
// -------------------------------------------------

interface BranchOption {
    id: string;
    branch_name: string;
}

interface FormErrors {
    title?: string;
    description?: string;
    priority?: string;
    branchId?: string;
    files?: string;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

interface UploadedFile {
    id: string;
    name: string;
    size: number;
    type: string;
    path?: string;
    signedUrl?: string;
    status: 'uploading' | 'success' | 'error';
    errorMessage?: string;
}

// -------------------------------------------------
// Options derived from requirements
// -------------------------------------------------

const PRIORITY_OPTIONS = [
    { value: TicketPriority.Low, label: 'Low' },
    { value: TicketPriority.Medium, label: 'Medium' },
    { value: TicketPriority.High, label: 'High' },
    { value: TicketPriority.Critical, label: 'Critical' },
];

const PRIORITY_BADGE_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
    Low: 'neutral',
    Medium: 'info',
    High: 'warning',
    Critical: 'danger',
};

const MODULE_OPTIONS = [
    { value: 'General', label: 'General' },
    { value: 'OPD', label: 'OPD' },
    { value: 'IPD', label: 'IPD' },
    { value: 'Pharmacy', label: 'Pharmacy' },
    { value: 'Lab', label: 'Laboratory' },
    { value: 'Billing', label: 'Billing' },
    { value: 'IT', label: 'IT Support' },
];

// -------------------------------------------------
// Component
// -------------------------------------------------

export function RaiseTicketForm() {
    const router = useRouter();

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<string>(TicketPriority.Medium);
    const [module, setModule] = useState<string>('General');
    const [branchId, setBranchId] = useState('');
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [branches, setBranches] = useState<BranchOption[]>([]);

    // UI state
    const [errors, setErrors] = useState<FormErrors>({});
    const [submitState, setSubmitState] = useState<SubmitState>('idle');
    const [isFetchingBranches, setIsFetchingBranches] = useState(true);
    const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // Load branches on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const result = await listBranches();
            if (cancelled) return;
            if (result.success && result.data.length > 0) {
                setBranches(result.data);
                setBranchId(result.data[0].id);
            }
            setIsFetchingBranches(false);
        })();
        return () => { cancelled = true; };
    }, []);

    // Validation
    const validate = useCallback((): boolean => {
        const errs: FormErrors = {};

        if (!title.trim()) errs.title = 'Summary is required';
        else if (title.trim().length < 5) errs.title = 'Summary must be at least 5 characters';

        if (!description.trim()) errs.description = 'Description is required';
        else if (description.trim().length < 10) errs.description = 'Please provide more detail (at least 10 characters)';

        if (!priority) errs.priority = 'Priority is required';
        if (!branchId) errs.branchId = 'Facility is required';

        if (files.some(f => f.status === 'uploading')) errs.files = 'Please wait for files to finish uploading';
        if (files.some(f => f.status === 'error')) errs.files = 'Please remove or retry failed file uploads';

        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [title, description, priority, branchId, files]);

    const handleFileUpload = async (selectedFiles: FileList) => {
        const newFiles = Array.from(selectedFiles).slice(0, 5 - files.length);
        if (newFiles.length === 0) return;
        
        const uploadPromises = newFiles.map(async (file) => {
            const id = Math.random().toString(36).substring(7);
            
            if (file.size > 10 * 1024 * 1024) {
                setFiles(prev => [...prev, { id, name: file.name, size: file.size, type: file.type, status: 'error', errorMessage: 'File exceeds 10MB limit' }]);
                return;
            }
            if (!['image/jpeg', 'image/png', 'image/gif', 'application/pdf'].includes(file.type)) {
                setFiles(prev => [...prev, { id, name: file.name, size: file.size, type: file.type, status: 'error', errorMessage: 'Only Images and PDFs are allowed' }]);
                return;
            }

            setFiles(prev => [...prev, { id, name: file.name, size: file.size, type: file.type, status: 'uploading' }]);
            
            const fileExt = file.name.split('.').pop();
            const filePath = `${Date.now()}-${id}.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage.from('ticket_attachments').upload(filePath, file);
            
            if (uploadError || !uploadData) {
                setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', errorMessage: uploadError?.message || 'Upload failed' } : f));
                return;
            }

            const { data: signedData, error: signedError } = await supabase.storage.from('ticket_attachments').createSignedUrl(uploadData.path, 60 * 60);

            if (signedError || !signedData) {
                setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', errorMessage: 'Failed to generate preview URL' } : f));
                return;
            }
            
            setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'success', path: uploadData.path, signedUrl: signedData.signedUrl } : f));
        });
        
        await Promise.all(uploadPromises);
    };

    // Submit handler
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        setSubmitState('submitting');
        setErrorMessage('');

        try {
            const result = await createTicket({
                title: title.trim(),
                description: description.trim(),
                priority: priority as TicketPriority,
                branchId,
                module,
            } as any);

            if (result.success && result.data) {
                const newTicketId = result.data.id;
                
                for (const f of files.filter(f => f.status === 'success')) {
                    if (f.path) {
                        await saveTicketAttachment({
                            ticketId: newTicketId,
                            fileUrl: f.path,
                            fileName: f.name,
                            fileSize: f.size,
                            mimeType: f.type,
                        });
                    }
                }

                setSubmitState('success');
                setCreatedTicketId(result.data.id);
            } else {
                setSubmitState('error');
                setErrorMessage('Failed to create ticket. Please try again.');
            }
        } catch {
            setSubmitState('error');
            setErrorMessage('An unexpected error occurred. Please try again.');
        }
    };

    // Success state
    if (submitState === 'success') {
        return (
            <Card padding="lg" className="max-w-xl mx-auto mt-8">
                <div className="flex flex-col items-center text-center py-6">
                    <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600 mb-5 ring-1 ring-emerald-200/50">
                        <CheckCircle2 className="h-10 w-10" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 mb-2 tracking-tight">
                        Ticket Created Successfully
                    </h2>
                    <p className="text-sm text-gray-500 mb-4 max-w-sm leading-relaxed">
                        Your support ticket has been submitted. Our team will review it shortly.
                    </p>
                    <div className="bg-gray-50 rounded-xl px-5 py-3 mb-6 ring-1 ring-gray-200/50">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                            Ticket ID
                        </p>
                        <p className="text-sm font-mono font-bold text-gray-900">
                            {createdTicketId?.slice(0, 8).toUpperCase()}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            size="md"
                            onClick={() => router.push('/help-center?tab=track')}
                        >
                            View My Tickets
                        </Button>
                        <Button
                            variant="primary"
                            size="md"
                            onClick={() => {
                                setSubmitState('idle');
                                setTitle('');
                                setDescription('');
                                setPriority(TicketPriority.Medium);
                                setModule('General');
                                setFiles([]);
                                setCreatedTicketId(null);
                                setErrors({});
                            }}
                        >
                            Raise Another
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    if (!isFetchingBranches && branches.length === 0) {
        return (
            <Card padding="md" className="max-w-2xl mx-auto mt-6">
                <div className="flex flex-col items-center py-10 text-center">
                    <div className="p-3 rounded-2xl bg-rose-50 text-rose-500 mb-3 ring-1 ring-rose-200/50">
                        <AlertTriangle className="h-7 w-7" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">No Facility Assigned</p>
                    <p className="text-xs text-gray-500">You must be assigned to at least one facility to raise a ticket. Please contact your administrator.</p>
                </div>
            </Card>
        );
    }

    return (
        <Card padding="none" className="max-w-2xl mx-auto mt-6">
            <div className="p-6 sm:p-8">
                <CardHeader className="mb-6">
                    <CardTitle className="text-base">Raise a Support Ticket</CardTitle>
                    <CardDescription>
                        Describe your issue and we&apos;ll get it resolved as quickly as possible.
                    </CardDescription>
                </CardHeader>

                {/* Error banner */}
                {submitState === 'error' && (
                    <div className="flex items-start gap-3 bg-rose-50 border border-rose-200/60 text-rose-700 rounded-xl px-4 py-3 mb-6 text-sm ring-1 ring-rose-600/5">
                        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-semibold">Submission failed</p>
                            <p className="text-xs mt-0.5 text-rose-600">{errorMessage}</p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Summary */}
                    <Input
                        id="help-center-title"
                        label="Summary"
                        placeholder="Brief description of the issue"
                        value={title}
                        onChange={(e) => {
                            setTitle(e.target.value);
                            if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
                        }}
                        error={errors.title}
                        maxLength={200}
                    />

                    {/* Module */}
                    <Select
                        id="help-center-module"
                        label="Module"
                        options={MODULE_OPTIONS}
                        value={module}
                        onChange={(e) => setModule(e.target.value)}
                    />

                    {/* Priority */}
                    <div className="space-y-1.5">
                        <Select
                            id="help-center-priority"
                            label="Priority"
                            options={PRIORITY_OPTIONS}
                            value={priority}
                            onChange={(e) => {
                                setPriority(e.target.value);
                                if (errors.priority) setErrors((prev) => ({ ...prev, priority: undefined }));
                            }}
                            error={errors.priority}
                        />
                        {priority && (
                            <div className="pl-0.5">
                                <Badge
                                    variant={PRIORITY_BADGE_VARIANT[priority] || 'neutral'}
                                    size="sm"
                                    dot
                                >
                                    {priority}
                                </Badge>
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <Textarea
                            id="help-center-description"
                            label="Detailed Description"
                            placeholder="Steps to reproduce, expected vs. actual behavior, any error messages…"
                            value={description}
                            onChange={(e) => {
                                setDescription(e.target.value);
                                if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
                            }}
                            error={errors.description}
                            rows={5}
                        />
                        {!errors.description && description.length > 0 && description.trim().length < 20 && (
                            <p className="text-xs text-gray-500 font-medium mt-1.5">
                                Add a few more details to help us resolve this faster
                            </p>
                        )}
                    </div>

                    {/* Attachment Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Attachments (Optional)</label>
                        {files.length < 5 && (
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors">
                                <input
                                    type="file"
                                    id="ticket-attachment"
                                    className="hidden"
                                    multiple
                                    onChange={(e) => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ''; }}
                                    accept="image/*,.pdf"
                                />
                                <label htmlFor="ticket-attachment" className="cursor-pointer flex flex-col items-center">
                                    <UploadCloud className="h-8 w-8 text-gray-400 mb-2" />
                                    <span className="text-sm font-medium text-primary-600">Click to upload</span>
                                    <span className="text-xs text-gray-500 mt-1">Images or PDFs up to 10MB (Max 5)</span>
                                </label>
                            </div>
                        )}
                        
                        {files.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {files.map(f => (
                                    <div key={f.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            {f.signedUrl && f.type.startsWith('image/') ? (
                                                <img src={f.signedUrl} alt="Preview" className="h-8 w-8 object-cover rounded shadow-sm border border-gray-200" />
                                            ) : (
                                                <div className="h-8 w-8 bg-gray-100 flex items-center justify-center rounded border border-gray-200"><FileText className="h-4 w-4 text-gray-400" /></div>
                                            )}
                                            <div className="flex flex-col truncate">
                                                <span className="text-sm font-medium text-gray-700 truncate">{f.name}</span>
                                                {f.status === 'uploading' && <span className="text-xs text-primary-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</span>}
                                                {f.status === 'error' && <span className="text-xs text-rose-600 font-medium">{f.errorMessage}</span>}
                                                {f.status === 'success' && <span className="text-xs text-gray-500">{(f.size / 1024 / 1024).toFixed(2)} MB</span>}
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => setFiles(prev => prev.filter(file => file.id !== f.id))} className="text-gray-400 hover:text-red-500 p-1">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {errors.files && <p className="text-xs text-rose-500 mt-1.5 font-medium">{errors.files}</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="md"
                            icon={<ArrowLeft className="h-4 w-4" />}
                            onClick={() => router.push('/help-center?tab=track')}
                        >
                            Back to Tickets
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            loading={submitState === 'submitting'}
                            icon={<Send className="h-4 w-4" />}
                        >
                            Submit Ticket
                        </Button>
                    </div>
                </form>
            </div>
        </Card>
    );
}
