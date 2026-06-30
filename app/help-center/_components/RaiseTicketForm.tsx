'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TicketPriority } from '@prisma/client';
import { Send, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createTicket } from '@/app/actions/help-center-actions';
import { listBranches } from '@/app/actions/branch-actions';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { Card, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/Card';
import { Badge } from '@/app/components/ui/Badge';

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
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

// -------------------------------------------------
// Priority options derived from the Prisma enum
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

// -------------------------------------------------
// Component
// -------------------------------------------------

export function RaiseTicketForm() {
    const router = useRouter();

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<string>(TicketPriority.Medium);
    const [branchId, setBranchId] = useState('');
    const [branches, setBranches] = useState<BranchOption[]>([]);

    // UI state
    const [errors, setErrors] = useState<FormErrors>({});
    const [submitState, setSubmitState] = useState<SubmitState>('idle');
    const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // Load branches on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const result = await listBranches();
            if (cancelled) return;
            if (result.success && result.data.length > 0) {
                setBranches(result.data.map((b: any) => ({ id: b.id, branch_name: b.branch_name })));
                // Auto-select if only one branch
                if (result.data.length === 1) {
                    setBranchId(result.data[0].id);
                }
            }
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

        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [title, description, priority, branchId]);

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
            });

            if (result.success && result.data) {
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
                            onClick={() => router.push('/help-center/track')}
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
                    {/* Facility selector — hidden if only one branch */}
                    {branches.length > 1 && (
                        <Select
                            id="help-center-branch"
                            label="Facility"
                            placeholder="Select a facility"
                            options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
                            value={branchId}
                            onChange={(e) => {
                                setBranchId(e.target.value);
                                if (errors.branchId) setErrors((prev) => ({ ...prev, branchId: undefined }));
                            }}
                            error={errors.branchId}
                        />
                    )}

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

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="md"
                            icon={<ArrowLeft className="h-4 w-4" />}
                            onClick={() => router.push('/help-center/track')}
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
