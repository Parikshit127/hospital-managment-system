'use client';

import React, { useState, useEffect } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import { BookOpen, Calendar, Plus, UploadCloud, FileText, CheckCircle2, AlertTriangle, Loader2, X, Download, Megaphone } from 'lucide-react';
import { getAllReleaseNotes, createReleaseNote, publishReleaseNote } from '@/app/actions/release-notes-actions';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Card, CardHeader, CardTitle } from '@/app/components/ui/Card';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase env vars not configured');
    return createClient(url, key);
};

interface UploadedFile {
    file: File;
    status: 'uploading' | 'success' | 'error';
    path?: string;
    errorMessage?: string;
}

export default function AdminReleaseNotesPage() {
    const [notes, setNotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isComposing, setIsComposing] = useState(false);
    const [title, setTitle] = useState('');
    const [version, setVersion] = useState('');
    const [content, setContent] = useState('');
    
    const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [publishingId, setPublishingId] = useState<string | null>(null);

    const loadNotes = async () => {
        setLoading(true);
        const res = await getAllReleaseNotes();
        if (res.success && res.data) {
            setNotes(res.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadNotes();
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            alert('File exceeds 10MB limit');
            return;
        }

        setUploadedFile({ file, status: 'uploading' });

        const id = Math.random().toString(36).substring(7);
        const fileExt = file.name.split('.').pop();
        const filePath = `${Date.now()}-${id}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await getSupabase().storage.from('release_docs').upload(filePath, file);

        if (uploadError || !uploadData) {
            setUploadedFile({ file, status: 'error', errorMessage: uploadError?.message || 'Upload failed' });
            return;
        }

        setUploadedFile({ file, status: 'success', path: uploadData.path });
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (uploadedFile && uploadedFile.status === 'uploading') {
            alert('Please wait for file to upload');
            return;
        }

        setSubmitting(true);
        
        const res = await createReleaseNote({
            title,
            version,
            content,
            fileUrl: uploadedFile?.path || null,
            fileName: uploadedFile?.file.name || null,
            mimeType: uploadedFile?.file.type || null,
        });

        if (res.success) {
            setIsComposing(false);
            setTitle('');
            setVersion('');
            setContent('');
            setUploadedFile(null);
            loadNotes();
        } else {
            alert(res.error || 'Failed to create release note');
        }
        setSubmitting(false);
    };

    const handlePublish = async (id: string) => {
        if (!confirm('Are you sure you want to publish this release note? It will immediately send a broadcast notification to all facilities.')) return;
        
        setPublishingId(id);
        const res = await publishReleaseNote(id);
        if (res.success) {
            loadNotes();
        } else {
            alert(res.error || 'Failed to publish');
        }
        setPublishingId(null);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <AdminPage
            pageTitle="Release Notes"
            pageIcon={<BookOpen className="h-5 w-5" />}
        >
            <div className="max-w-4xl mx-auto py-6 space-y-6">
                {!isComposing ? (
                    <div className="flex justify-end">
                        <Button
                            variant="primary"
                            icon={<Plus className="h-4 w-4" />}
                            onClick={() => setIsComposing(true)}
                        >
                            Draft Release Note
                        </Button>
                    </div>
                ) : (
                    <Card padding="none">
                        <div className="p-6">
                            <CardHeader className="mb-6 px-0 pt-0">
                                <CardTitle className="text-lg">Draft Release Note</CardTitle>
                            </CardHeader>
                            <form onSubmit={handleCreate} className="space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <Input
                                        id="version"
                                        label="Version"
                                        placeholder="e.g., 2.4.0"
                                        value={version}
                                        onChange={(e) => setVersion(e.target.value)}
                                        required
                                    />
                                    <Input
                                        id="title"
                                        label="Title"
                                        placeholder="Brief title of the release"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        required
                                    />
                                </div>

                                <Textarea
                                    id="content"
                                    label="Release Details"
                                    placeholder="What's new in this release..."
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    rows={6}
                                />

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Attachment (Optional)</label>
                                    {!uploadedFile ? (
                                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors">
                                            <input
                                                type="file"
                                                id="release-attachment"
                                                className="hidden"
                                                onChange={handleFileUpload}
                                                accept=".pdf,.md"
                                            />
                                            <label htmlFor="release-attachment" className="cursor-pointer flex flex-col items-center">
                                                <UploadCloud className="h-8 w-8 text-gray-400 mb-2" />
                                                <span className="text-sm font-medium text-primary-600">Click to upload</span>
                                                <span className="text-xs text-gray-500 mt-1">PDF or Markdown up to 10MB</span>
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 bg-white flex items-center justify-center rounded border border-gray-200">
                                                    <FileText className="h-4 w-4 text-gray-400" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-700">{uploadedFile.file.name}</span>
                                                    {uploadedFile.status === 'uploading' && <span className="text-xs text-primary-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</span>}
                                                    {uploadedFile.status === 'error' && <span className="text-xs text-rose-600 font-medium">{uploadedFile.errorMessage}</span>}
                                                    {uploadedFile.status === 'success' && <span className="text-xs text-gray-500">{(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB</span>}
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => setUploadedFile(null)} className="text-gray-400 hover:text-red-500 p-1">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <Button type="button" variant="ghost" onClick={() => setIsComposing(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        disabled={submitting || uploadedFile?.status === 'uploading'}
                                        loading={submitting}
                                    >
                                        Save Draft
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </Card>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {notes.map(note => (
                            <div key={note.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col sm:flex-row">
                                <div className="p-6 flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-bold rounded uppercase tracking-wider">
                                            v{note.version}
                                        </span>
                                        <h3 className="text-lg font-bold text-gray-900">{note.title}</h3>
                                    </div>
                                    <p className="text-sm text-gray-500 mb-4 flex items-center gap-2">
                                        <Calendar className="h-3.5 w-3.5" />
                                        Created on {formatDate(note.created_at)}
                                    </p>
                                    <p className="text-sm text-gray-600 line-clamp-2">
                                        {note.content}
                                    </p>
                                    {note.file_name && (
                                        <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                            <FileText className="h-3.5 w-3.5" /> {note.file_name}
                                        </div>
                                    )}
                                </div>
                                <div className="bg-gray-50 border-l border-gray-100 p-6 flex flex-col justify-center sm:w-64">
                                    {note.is_published ? (
                                        <div className="text-center">
                                            <div className="mx-auto w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                                                <CheckCircle2 className="h-5 w-5" />
                                            </div>
                                            <p className="text-sm font-bold text-gray-900">Published</p>
                                            <p className="text-xs text-gray-500 mt-1">{formatDate(note.published_at)}</p>
                                        </div>
                                    ) : (
                                        <div className="text-center space-y-3">
                                            <div className="inline-block px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                                                Draft
                                            </div>
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                className="w-full justify-center"
                                                icon={<Megaphone className="h-4 w-4" />}
                                                onClick={() => handlePublish(note.id)}
                                                disabled={publishingId === note.id}
                                                loading={publishingId === note.id}
                                            >
                                                Publish & Broadcast
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AdminPage>
    );
}
