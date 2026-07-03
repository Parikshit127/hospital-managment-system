'use client';

import React, { useState, useEffect } from 'react';
import { getReleaseNotes, getReleaseNoteSignedUrl } from '@/app/actions/release-notes-actions';
import { BookOpen, Calendar, Download } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { LoadingState } from '@/app/components/ui/LoadingState';
import { EmptyState } from '@/app/components/ui/EmptyState';

// Read-only Release Notes list for the hospital-side Help Center (v2 §3.2 Tab 3).
// Extracted verbatim from the former /help-center/release-notes page so the
// consolidated tabbed Help Center reuses the exact same functionality — this is
// a relocation, not new functionality (PRD v3 Addendum §4).

interface ReleaseNote {
    id: string;
    version: string;
    title: string;
    content: string;
    file_url: string | null;
    file_name: string | null;
    published_at: string;
}

export function ReleaseNotesPanel() {
    const [notes, setNotes] = useState<ReleaseNote[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        getReleaseNotes().then((res) => {
            if (isMounted) {
                if (res.success && res.data) {
                    setNotes(res.data);
                }
                setLoading(false);
            }
        });
        return () => { isMounted = false; };
    }, []);

    const handleDownload = async (fileUrl: string) => {
        const res = await getReleaseNoteSignedUrl(fileUrl);
        if (res.success && res.signedUrl) {
            window.open(res.signedUrl, '_blank');
        } else {
            alert('Could not open file.');
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };

    if (loading) {
        return <LoadingState message="Loading release notes..." />;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-primary-100 text-primary-600 rounded-xl">
                    <BookOpen className="h-6 w-6" />
                </div>
                <div>
                    <h2 className="text-xl font-black text-gray-900">Release Notes</h2>
                    <p className="text-gray-500">What&apos;s new in HospitalOS</p>
                </div>
            </div>

            {notes.length === 0 ? (
                <EmptyState
                    icon={<BookOpen className="h-8 w-8" />}
                    title="No release notes"
                    description="There are no published release notes yet."
                />
            ) : (
                <div className="space-y-6">
                    {notes.map((note) => (
                        <div key={note.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="px-2.5 py-1 bg-primary-100 text-primary-700 text-xs font-bold rounded-lg uppercase tracking-wider">
                                            v{note.version}
                                        </span>
                                        <h3 className="text-lg font-bold text-gray-900">{note.title}</h3>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                                        <Calendar className="h-4 w-4" />
                                        {formatDate(note.published_at)}
                                    </div>
                                </div>
                                {note.file_url && note.file_name && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        icon={<Download className="h-4 w-4" />}
                                        onClick={() => handleDownload(note.file_url!)}
                                    >
                                        {note.file_name}
                                    </Button>
                                )}
                            </div>

                            <div className="p-6">
                                <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-wrap">
                                    {note.content}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
