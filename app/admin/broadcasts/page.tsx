'use client';

import React, { useState } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { Megaphone, Send, CheckCheck, AlertCircle, Building2 } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
// TEMPORARY: stubbed action while Person B builds the real hospital broadcast
// backend. Swap this import for the real action once it lands.
import { sendLocalBroadcast } from '@/app/actions/local-broadcast-stub';

export default function AdminBroadcastsPage() {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSuccessMessage('');
        setErrorMessage('');

        if (!title.trim() || !body.trim()) {
            setErrorMessage('Title and body are required.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await sendLocalBroadcast({ title: title.trim(), body: body.trim() });
            if (res.success) {
                setSuccessMessage(
                    `Broadcast sent to your hospital${
                        res.data?.recipients != null ? ` (${res.data.recipients} recipients)` : ''
                    }.`,
                );
                setTitle('');
                setBody('');
            } else {
                setErrorMessage('Failed to send broadcast.');
            }
        } catch {
            setErrorMessage('An unexpected error occurred.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AdminPage pageTitle="Broadcasts" pageIcon={<Megaphone className="h-5 w-5" />}>
            <div className="max-w-2xl mx-auto py-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <div>
                            <h2 className="text-lg font-black text-gray-900">Compose Broadcast</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Send an announcement to everyone in your hospital.
                            </p>
                        </div>
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                            <Megaphone className="h-6 w-6" />
                        </div>
                    </div>

                    <div className="p-6">
                        {/* Audience is implicit — this always sends to the whole hospital. */}
                        <div className="mb-6 p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-3 text-sm text-gray-600">
                            <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                            <span>This broadcast is delivered to <strong>all users in your hospital</strong>.</span>
                        </div>

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
                                id="broadcast-title"
                                label="Broadcast Title"
                                placeholder="Enter a concise title..."
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />

                            <Textarea
                                id="broadcast-body"
                                label="Broadcast Body"
                                placeholder="Details of the broadcast..."
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                required
                                rows={5}
                            />

                            <div className="flex justify-end pt-2">
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="lg"
                                    disabled={submitting}
                                    loading={submitting}
                                    icon={<Send className="h-4 w-4" />}
                                >
                                    Send Broadcast
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </AdminPage>
    );
}
