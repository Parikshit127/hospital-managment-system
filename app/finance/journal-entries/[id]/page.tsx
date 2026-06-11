'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, RotateCcw, Calendar, Tag, Hash, FileText } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { Button } from '@/app/components/ui/Button';
import { Badge } from '@/app/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/app/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/app/components/ui/Table';
import { getJournalEntryDetails, reverseJournalEntry } from '@/app/actions/gl-actions';

type JournalLine = {
    id: string;
    line_number: number;
    account_id: string;
    description: string | null;
    debit_amount: number;
    credit_amount: number;
    account: {
        account_code: string;
        account_name: string;
    };
};

type JournalEntry = {
    id: string;
    journal_number: string;
    entry_date: Date | string;
    entry_type: string;
    status: string;
    narration: string | null;
    reference_type: string | null;
    reference_number: string | null;
    lines: JournalLine[];
};

type BadgeVariant = 'warning' | 'success' | 'danger' | 'info' | 'neutral' | 'purple';

function getStatusVariant(status: string): BadgeVariant {
    switch (status) {
        case 'Draft': return 'warning';
        case 'Posted': return 'success';
        case 'Reversed': return 'danger';
        default: return 'neutral';
    }
}

function formatAmount(amount: number): string {
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function JournalEntryDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const toast = useToast();

    const [journal, setJournal] = useState<JournalEntry | null>(null);
    const [loading, setLoading] = useState(true);
    const [reversing, setReversing] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        getJournalEntryDetails(id).then((res) => {
            if (res.success && res.journal) {
                setJournal(res.journal as unknown as JournalEntry);
            } else {
                toast.error('Failed to load journal entry details');
            }
            setLoading(false);
        });
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleReverse = async () => {
        const reason = window.prompt('Enter reason for reversing this journal entry:');
        if (!reason || !reason.trim()) return;

        setReversing(true);
        const res = await reverseJournalEntry(id, reason.trim());
        if (res.success) {
            toast.success('Journal entry reversed successfully');
            // Reload details
            const refreshed = await getJournalEntryDetails(id);
            if (refreshed.success && refreshed.journal) {
                setJournal(refreshed.journal as unknown as JournalEntry);
            }
        } else {
            toast.error(res.error || 'Failed to reverse journal entry');
        }
        setReversing(false);
    };

    const totalDebit = journal?.lines.reduce((sum, l) => sum + l.debit_amount, 0) ?? 0;
    const totalCredit = journal?.lines.reduce((sum, l) => sum + l.credit_amount, 0) ?? 0;

    if (loading) {
        return (
            <AppShell pageTitle="Journal Entry">
                <div className="p-12 text-center text-gray-400 font-medium">Loading journal entry...</div>
            </AppShell>
        );
    }

    if (!journal) {
        return (
            <AppShell pageTitle="Not Found">
                <div className="p-12 text-center text-rose-500 font-bold">Journal entry not found.</div>
            </AppShell>
        );
    }

    return (
        <AppShell
            pageTitle={`Journal Entry ${journal.journal_number}`}
            pageIcon={<BookOpen className="h-5 w-5" />}
        >
            <div className="max-w-5xl mx-auto space-y-6 p-6">

                {/* Back link + Actions */}
                <div className="flex items-center justify-between">
                    <Link
                        href="/finance/journal-entries"
                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Journal Entries
                    </Link>

                    {journal.status === 'Posted' && (
                        <Button
                            variant="danger"
                            size="sm"
                            icon={<RotateCcw className="h-4 w-4" />}
                            loading={reversing}
                            onClick={handleReverse}
                        >
                            Reverse Entry
                        </Button>
                    )}
                </div>

                {/* Header Card */}
                <Card>
                    <CardHeader className="mb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle>{journal.journal_number}</CardTitle>
                            <Badge variant={getStatusVariant(journal.status)}>
                                {journal.status}
                            </Badge>
                        </div>
                    </CardHeader>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 mt-4 sm:grid-cols-4">
                        <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                <Calendar className="h-3.5 w-3.5" />
                                Entry Date
                            </span>
                            <span className="text-sm font-semibold text-gray-900">{formatDate(journal.entry_date)}</span>
                        </div>

                        <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                <Tag className="h-3.5 w-3.5" />
                                Entry Type
                            </span>
                            <span className="text-sm font-semibold text-gray-900">{journal.entry_type}</span>
                        </div>

                        {journal.reference_type && (
                            <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                    <Hash className="h-3.5 w-3.5" />
                                    Reference Type
                                </span>
                                <span className="text-sm font-semibold text-gray-900">{journal.reference_type}</span>
                            </div>
                        )}

                        {journal.reference_number && (
                            <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                    <FileText className="h-3.5 w-3.5" />
                                    Reference No.
                                </span>
                                <span className="text-sm font-semibold text-gray-900">{journal.reference_number}</span>
                            </div>
                        )}
                    </div>

                    {journal.narration && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-500 mb-1">Narration</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{journal.narration}</p>
                        </div>
                    )}
                </Card>

                {/* Journal Lines */}
                <Card padding="none">
                    <div className="p-4 border-b border-gray-100">
                        <CardTitle>Journal Lines</CardTitle>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableCell header>#</TableCell>
                                <TableCell header>Account</TableCell>
                                <TableCell header>Description</TableCell>
                                <TableCell header>Debit (₹)</TableCell>
                                <TableCell header>Credit (₹)</TableCell>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {journal.lines.map((line) => (
                                <TableRow key={line.id}>
                                    <TableCell>{line.line_number}</TableCell>
                                    <TableCell>
                                        <span className="font-mono text-xs text-gray-500 mr-1">{line.account.account_code}</span>
                                        <span className="text-sm text-gray-900">{line.account.account_name}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-gray-600">{line.description || '—'}</span>
                                    </TableCell>
                                    <TableCell>
                                        {line.debit_amount > 0 ? (
                                            <span className="text-sm font-medium text-gray-900">{formatAmount(line.debit_amount)}</span>
                                        ) : (
                                            <span className="text-sm text-gray-300">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {line.credit_amount > 0 ? (
                                            <span className="text-sm font-medium text-gray-900">{formatAmount(line.credit_amount)}</span>
                                        ) : (
                                            <span className="text-sm text-gray-300">—</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}

                            {/* Totals row */}
                            <TableRow>
                                <TableCell header>{''}</TableCell>
                                <TableCell header>
                                    <span className="text-sm font-bold text-gray-900">Totals</span>
                                </TableCell>
                                <TableCell header>{''}</TableCell>
                                <TableCell header>
                                    <span className="text-sm font-bold text-gray-900">{formatAmount(totalDebit)}</span>
                                </TableCell>
                                <TableCell header>
                                    <span className="text-sm font-bold text-gray-900">{formatAmount(totalCredit)}</span>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>

                    {/* Balance check */}
                    <div className="p-4 border-t border-gray-100 flex justify-end">
                        {Math.abs(totalDebit - totalCredit) < 0.01 ? (
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                                Balanced
                            </span>
                        ) : (
                            <span className="text-xs font-medium text-rose-600 bg-rose-50 px-3 py-1 rounded-full">
                                Unbalanced — Difference: ₹{formatAmount(Math.abs(totalDebit - totalCredit))}
                            </span>
                        )}
                    </div>
                </Card>

            </div>
        </AppShell>
    );
}
