'use client';

import React, { useState, useEffect } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { Megaphone, Users, Building, AlertCircle, Loader2, Send, CheckCheck } from 'lucide-react';
import { sendBroadcast, getBroadcastAudienceCount } from '@/app/actions/broadcast-actions';
import { listBranches } from '@/app/actions/branch-actions';
import { BroadcastAudience } from '@prisma/client';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';

const ALL_ROLES = [
    { value: 'admin', label: 'Admin' },
    { value: 'doctor', label: 'Doctor' },
    { value: 'receptionist', label: 'Receptionist' },
    { value: 'lab_technician', label: 'Lab Tech' },
    { value: 'pharmacist', label: 'Pharmacist' },
    { value: 'finance', label: 'Finance' },
    { value: 'ipd_manager', label: 'IPD Mgr' },
    { value: 'nurse', label: 'Nurse' },
    { value: 'opd_manager', label: 'OPD Mgr' },
    { value: 'hr', label: 'HR' },
];

const AUDIENCE_OPTIONS = [
    { value: BroadcastAudience.GLOBAL, label: 'Global (All Users)' },
    { value: BroadcastAudience.ROLE, label: 'By Role' },
    { value: BroadcastAudience.FACILITY, label: 'By Facility' },
];

export default function AdminBroadcastsPage() {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [audience, setAudience] = useState<BroadcastAudience>(BroadcastAudience.GLOBAL);
    const [facilityId, setFacilityId] = useState('');
    const [targetRole, setTargetRole] = useState('');
    const [scheduledFor, setScheduledFor] = useState('');

    const [branches, setBranches] = useState<any[]>([]);
    const [audienceCount, setAudienceCount] = useState<number | null>(null);
    const [counting, setCounting] = useState(false);
    
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        listBranches().then((res) => {
            if (res.success && res.data) {
                setBranches(res.data);
                if (res.data.length > 0) {
                    setFacilityId(res.data[0].id);
                }
            }
        });
        setTargetRole(ALL_ROLES[0].value);
    }, []);

    useEffect(() => {
        let isMounted = true;
        
        async function fetchCount() {
            if (audience === BroadcastAudience.FACILITY && !facilityId) return;
            if (audience === BroadcastAudience.ROLE && !targetRole) return;
            
            setCounting(true);
            const res = await getBroadcastAudienceCount(audience, facilityId, targetRole);
            if (isMounted) {
                if (res.success) {
                    setAudienceCount(res.count);
                } else {
                    setAudienceCount(null);
                }
                setCounting(false);
            }
        }

        const timer = setTimeout(fetchCount, 300);
        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [audience, facilityId, targetRole]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setSuccessMessage('');
        setErrorMessage('');

        try {
            const res = await sendBroadcast({
                title,
                body,
                audience,
                facilityId: audience === BroadcastAudience.FACILITY ? facilityId : null,
                targetRole: audience === BroadcastAudience.ROLE ? targetRole : null,
                scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
            });

            if (res.success) {
                setSuccessMessage('Broadcast composed successfully.');
                setTitle('');
                setBody('');
                setScheduledFor('');
            } else {
                setErrorMessage(res.error || 'Failed to send broadcast');
            }
        } catch (err) {
            setErrorMessage('An unexpected error occurred.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPage
            pageTitle="Admin Broadcasts"
            pageIcon={<Megaphone className="h-5 w-5" />}
        >
            <div className="max-w-3xl mx-auto py-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <div>
                            <h2 className="text-lg font-black text-gray-900">Compose Broadcast</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Send notifications to all users, specific roles, or specific facilities.
                            </p>
                        </div>
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                            <Megaphone className="h-6 w-6" />
                        </div>
                    </div>

                    <div className="p-6">
                        {successMessage && (
                            <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 flex items-center gap-3">
                                <CheckCheck className="h-5 w-5 shrink-0" />
                                <span className="text-sm font-semibold">{successMessage}</span>
                            </div>
                        )}
                        {errorMessage && (
                            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-3">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <span className="text-sm font-semibold">{errorMessage}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <Input
                                id="title"
                                label="Broadcast Title"
                                placeholder="Enter a concise title..."
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />

                            <Textarea
                                id="body"
                                label="Broadcast Body"
                                placeholder="Details of the broadcast..."
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                required
                                rows={4}
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <Select
                                    id="audience"
                                    label="Target Audience"
                                    options={AUDIENCE_OPTIONS}
                                    value={audience}
                                    onChange={(e) => setAudience(e.target.value as BroadcastAudience)}
                                />

                                {audience === BroadcastAudience.ROLE && (
                                    <Select
                                        id="targetRole"
                                        label="Select Role"
                                        options={ALL_ROLES}
                                        value={targetRole}
                                        onChange={(e) => setTargetRole(e.target.value)}
                                    />
                                )}

                                {audience === BroadcastAudience.FACILITY && (
                                    <Select
                                        id="facilityId"
                                        label="Select Facility"
                                        options={branches.map(b => ({ value: b.id, label: b.branch_name }))}
                                        value={facilityId}
                                        onChange={(e) => setFacilityId(e.target.value)}
                                    />
                                )}
                            </div>

                            <div>
                                <Input
                                    id="scheduledFor"
                                    label="Schedule For (Optional)"
                                    type="datetime-local"
                                    value={scheduledFor}
                                    onChange={(e) => setScheduledFor(e.target.value)}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Leave blank to send immediately.
                                </p>
                            </div>

                            {/* Audience Preview */}
                            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-lg border border-gray-200 text-gray-500">
                                        {audience === BroadcastAudience.FACILITY ? <Building className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                            Estimated Audience
                                        </p>
                                        <p className="text-sm font-semibold text-gray-900 mt-0.5">
                                            {counting ? (
                                                <span className="flex items-center gap-2 text-gray-500">
                                                    <Loader2 className="h-3 w-3 animate-spin" /> Calculating...
                                                </span>
                                            ) : audienceCount !== null ? (
                                                `${audienceCount} user${audienceCount !== 1 ? 's' : ''}`
                                            ) : (
                                                'Unavailable'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="lg"
                                    disabled={submitting || (audienceCount === 0 && !scheduledFor)}
                                    loading={submitting}
                                    icon={<Send className="h-4 w-4" />}
                                >
                                    {scheduledFor ? 'Schedule Broadcast' : 'Send Broadcast Now'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AdminPage>
    );
}
