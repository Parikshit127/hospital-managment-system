'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getJournalEntries, reverseJournalEntry } from '@/app/actions/gl-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Badge } from '@/app/components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/app/components/ui/Table';
import { Select } from '@/app/components/ui/Select';
import { Card } from '@/app/components/ui/Card';
import { useToast } from '@/app/components/ui/Toast';
import { Plus, Eye, RotateCcw, BookOpen, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface JournalEntry {
  id: string;
  journal_number: string;
  entry_date: Date;
  entry_type: string;
  narration: string;
  total_debit: number;
  total_credit: number;
  status: string;
  reference_number: string | null;
}

const ENTRY_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'Manual', label: 'Manual' },
  { value: 'Invoice', label: 'Invoice' },
  { value: 'Payment', label: 'Payment' },
  { value: 'Expense', label: 'Expense' },
  { value: 'Adjustment', label: 'Adjustment' },
  { value: 'Opening', label: 'Opening' },
  { value: 'Closing', label: 'Closing' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'Draft', label: 'Draft' },
  { value: 'Posted', label: 'Posted' },
  { value: 'Reversed', label: 'Reversed' },
];

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'Posted': return 'success';
    case 'Draft': return 'warning';
    case 'Reversed': return 'danger';
    default: return 'neutral';
  }
}

function getTypeVariant(type: string): 'info' | 'purple' | 'success' | 'warning' | 'neutral' {
  switch (type) {
    case 'Manual': return 'info';
    case 'Invoice': return 'purple';
    case 'Payment': return 'success';
    case 'Expense': return 'warning';
    case 'Adjustment': return 'warning';
    case 'Opening': return 'info';
    case 'Closing': return 'neutral';
    default: return 'neutral';
  }
}

export default function JournalEntriesPage() {
  const router = useRouter();
  const toast = useToast();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadEntries();
  }, [filterType, filterStatus, startDate, endDate]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const organizationId = localStorage.getItem('organizationId') || '';

      const filters: Record<string, unknown> = {};
      if (filterType !== 'all') filters.entry_type = filterType;
      if (filterStatus !== 'all') filters.status = filterStatus;
      if (startDate) filters.start_date = new Date(startDate);
      if (endDate) filters.end_date = new Date(endDate);

      const result = await getJournalEntries(organizationId, filters);
      if (result.success) {
        setEntries(result.entries as JournalEntry[]);
      } else {
        toast.error('Failed to load journal entries');
      }
    } catch {
      toast.error('Error loading journal entries');
    } finally {
      setLoading(false);
    }
  };

  const handleReverse = async (journalId: string, journalNumber: string) => {
    if (!confirm(`Are you sure you want to reverse journal entry ${journalNumber}?`)) {
      return;
    }

    const reason = prompt('Enter reason for reversal:');
    if (!reason) return;

    try {
      const result = await reverseJournalEntry(journalId, reason);
      if (result.success) {
        toast.success('Journal entry reversed successfully');
        loadEntries();
      } else {
        toast.error(result.error || 'Failed to reverse entry');
      }
    } catch {
      toast.error('Error reversing journal entry');
    }
  };

  const filteredEntries = searchQuery.trim()
    ? entries.filter(
        (e) =>
          e.journal_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.narration.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  return (
    <AppShell
      pageTitle="Journal Entries"
      pageIcon={<BookOpen className="h-5 w-5" />}
      headerActions={
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => router.push('/finance/journal-entries/new')}
        >
          New Entry
        </Button>
      }
      onRefresh={loadEntries}
      refreshing={loading}
    >
      <Card>
        {/* Filters */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--admin-border)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Input
              placeholder="Search journal # or narration..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              options={ENTRY_TYPE_OPTIONS}
              placeholder="Entry Type"
            />

            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={STATUS_OPTIONS}
              placeholder="Status"
            />

            <div className="flex gap-2">
              <Input
                type="date"
                label="From"
                value={startDate}
                icon={<Calendar className="w-4 h-4" />}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                type="date"
                label="To"
                value={endDate}
                icon={<Calendar className="w-4 h-4" />}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-10 text-center" style={{ color: 'var(--admin-text-muted)' }}>
            Loading entries...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 text-center" style={{ color: 'var(--admin-text-muted)' }}>
            No journal entries found. Create your first entry to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell header>Journal Number</TableCell>
                <TableCell header>Date</TableCell>
                <TableCell header>Type</TableCell>
                <TableCell header>Narration</TableCell>
                <TableCell header>Debit</TableCell>
                <TableCell header>Credit</TableCell>
                <TableCell header>Status</TableCell>
                <TableCell header>Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow
                  key={entry.id}
                  onClick={() => router.push(`/finance/journal-entries/${entry.id}`)}
                >
                  <TableCell>
                    <span className="font-mono text-sm">{entry.journal_number}</span>
                  </TableCell>
                  <TableCell>
                    {format(new Date(entry.entry_date), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getTypeVariant(entry.entry_type)} size="sm">
                      {entry.entry_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="max-w-xs truncate block">{entry.narration}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono">{entry.total_debit.toFixed(2)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono">{entry.total_credit.toFixed(2)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(entry.status)} size="sm">
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Eye className="w-4 h-4" />}
                        onClick={() => router.push(`/finance/journal-entries/${entry.id}`)}
                      >
                        View
                      </Button>
                      {entry.status === 'Posted' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<RotateCcw className="w-4 h-4" />}
                          onClick={() => handleReverse(entry.id, entry.journal_number)}
                        >
                          Reverse
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="mt-3 text-sm" style={{ color: 'var(--admin-text-muted)' }}>
        Showing {filteredEntries.length} of {entries.length} journal entries
      </div>
    </AppShell>
  );
}
