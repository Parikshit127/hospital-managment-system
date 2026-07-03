'use client';

import React, { useState, useEffect } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { Settings, Mail, Save, CheckCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { getDevPortalEmail, saveDevPortalEmail } from './actions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DevPortalSettingsPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        let mounted = true;
        getDevPortalEmail()
            .then((res) => {
                if (mounted && res.success) setEmail(res.email ?? '');
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSuccessMessage('');
        setErrorMessage('');

        if (!EMAIL_RE.test(email.trim())) {
            setErrorMessage('Please enter a valid email address.');
            return;
        }

        setSaving(true);
        try {
            const res = await saveDevPortalEmail({ email: email.trim() });
            if (res.success) {
                setSuccessMessage('Your email has been saved.');
            } else {
                setErrorMessage(res.error || 'Failed to save email.');
            }
        } catch {
            setErrorMessage('An unexpected error occurred.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminPage pageTitle="Settings" pageIcon={<Settings className="h-5 w-5" />}>
            <div className="max-w-xl mx-auto py-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-lg font-black text-gray-900">Contact Email</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            The email where you receive Dev Portal notifications and alerts.
                        </p>
                    </div>

                    <div className="p-6">
                        {loading ? (
                            <div className="flex items-center gap-2 py-6 text-gray-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm">Loading…</span>
                            </div>
                        ) : (
                            <>
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
                                        id="dev-email"
                                        type="email"
                                        label="Email Address"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        icon={<Mail className="h-4 w-4" />}
                                        required
                                    />

                                    <div className="flex justify-end">
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            size="md"
                                            disabled={saving}
                                            loading={saving}
                                            icon={<Save className="h-4 w-4" />}
                                        >
                                            Save Email
                                        </Button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </AdminPage>
    );
}
