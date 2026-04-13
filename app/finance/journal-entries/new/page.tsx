'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createJournalEntry, getGLAccounts } from '@/app/actions/gl-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { Button } from '@/app/components/ui/Button';
import { Input, Textarea } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { Card, CardHeader, CardTitle } from '@/app/components/ui/Card';
import { useToast } from '@/app/components/ui/Toast';
import { Plus, Trash2, ArrowLeft, BookOpen } from 'lucide-react';

interface GLAccount {
  id: string;
  account_code: string;
  account_name: string;
}

interface JournalLine {
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  description: string;
}

const ENTRY_TYPE_OPTIONS = [
  { value: 'Manual', label: 'Manual' },
  { value: 'Adjustment', label: 'Adjustment' },
  { value: 'Opening', label: 'Opening Balance' },
  { value: 'Closing', label: 'Closing Entry' },
];

export default function NewJournalEntryPage() {
  const router = useRouter();
  const toast = useToast();

  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    entry_type: 'Manual',
    narration: '',
  });

  const [lines, setLines] = useState<JournalLine[]>([
    { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
    { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
  ]);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const organizationId = localStorage.getItem('organizationId') || '';
      const result = await getGLAccounts(organizationId);
      if (result.success) {
        setAccounts(result.accounts as GLAccount[]);
      }
    } catch {
      toast.error('Failed to load accounts');
    }
  };

  const addLine = () => {
    setLines([
      ...lines,
      { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: keyof JournalLine, value: string | number) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setLines(newLines);
  };

  const calculateTotals = () => {
    const totalDebit = lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0);
    return { totalDebit, totalCredit, difference: totalDebit - totalCredit };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { totalDebit, totalCredit, difference } = calculateTotals();

    if (Math.abs(difference) > 0.01) {
      toast.error(`Journal entry not balanced. Difference: ${difference.toFixed(2)}`);
      return;
    }

    if (lines.some((line) => !line.account_id)) {
      toast.error('Please select an account for all lines');
      return;
    }

    setLoading(true);
    try {
      const organizationId = localStorage.getItem('organizationId') || '';

      const result = await createJournalEntry({
        organizationId,
        entry_date: new Date(formData.entry_date),
        entry_type: formData.entry_type,
        narration: formData.narration,
        lines: lines.map((line) => ({
          account_id: line.account_id,
          debit_amount: line.debit_amount || 0,
          credit_amount: line.credit_amount || 0,
          description: line.description,
        })),
      });

      if (result.success) {
        toast.success('Journal entry created successfully');
        router.push('/finance/journal-entries');
      } else {
        toast.error(result.error || 'Failed to create journal entry');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();
  const isBalanced = Math.abs(totals.difference) < 0.01;

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.account_code} - ${a.account_name}`,
  }));

  return (
    <AppShell
      pageTitle="New Journal Entry"
      pageIcon={<BookOpen className="h-4 w-4" />}
      headerActions={
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => router.back()}
        >
          Back
        </Button>
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <p className="text-sm text-gray-500">Create a manual journal entry</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Entry Details */}
          <Card>
            <CardHeader>
              <CardTitle>Entry Details</CardTitle>
            </CardHeader>
            <div className="pt-5 grid grid-cols-2 gap-4">
              <Input
                label="Entry Date *"
                type="date"
                value={formData.entry_date}
                onChange={(e) =>
                  setFormData({ ...formData, entry_date: e.target.value })
                }
                required
              />
              <Select
                label="Entry Type *"
                options={ENTRY_TYPE_OPTIONS}
                value={formData.entry_type}
                onChange={(e) =>
                  setFormData({ ...formData, entry_type: e.target.value })
                }
              />
              <div className="col-span-2">
                <Textarea
                  label="Narration *"
                  value={formData.narration}
                  onChange={(e) =>
                    setFormData({ ...formData, narration: e.target.value })
                  }
                  rows={3}
                  required
                />
              </div>
            </div>
          </Card>

          {/* Journal Lines */}
          <Card>
            <div className="flex items-center justify-between pb-4 border-b border-gray-100/80">
              <CardTitle>Journal Lines</CardTitle>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={addLine}
              >
                Add Line
              </Button>
            </div>

            <div className="pt-5 space-y-3">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-3 items-end p-4 bg-gray-50/60 border border-gray-200/60 rounded-xl"
                >
                  <div className="col-span-4">
                    <Select
                      label="Account *"
                      options={accountOptions}
                      placeholder="Select account"
                      value={line.account_id}
                      onChange={(e) => updateLine(index, 'account_id', e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      label="Description"
                      value={line.description}
                      onChange={(e) => updateLine(index, 'description', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label="Debit"
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.debit_amount || ''}
                      onChange={(e) =>
                        updateLine(index, 'debit_amount', parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label="Credit"
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.credit_amount || ''}
                      onChange={(e) =>
                        updateLine(index, 'credit_amount', parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="col-span-1 flex justify-center pb-0.5">
                    {lines.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="w-7" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-5 p-4 bg-gray-50 rounded-xl border border-gray-200/60">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700">Totals</span>
                <div className="flex gap-8">
                  <div className="text-right">
                    <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">
                      Total Debit
                    </div>
                    <div className="font-mono font-semibold text-gray-900 text-sm">
                      {totals.totalDebit.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">
                      Total Credit
                    </div>
                    <div className="font-mono font-semibold text-gray-900 text-sm">
                      {totals.totalCredit.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">
                      Difference
                    </div>
                    <div
                      className={`font-mono font-semibold text-sm ${
                        isBalanced ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {totals.difference.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
              {!isBalanced && (
                <p className="mt-2 text-xs font-medium text-rose-600">
                  Journal entry must be balanced (total debits = total credits)
                </p>
              )}
              {isBalanced && lines.length >= 2 && (
                <p className="mt-2 text-xs font-medium text-emerald-600">
                  Journal entry is balanced
                </p>
              )}
            </div>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={!isBalanced}
            >
              {loading ? 'Creating...' : 'Create Journal Entry'}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
