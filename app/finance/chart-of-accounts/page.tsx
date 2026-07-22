'use client';

import { useState, useEffect } from 'react';
import { getGLAccounts, createGLAccount, updateGLAccount } from '@/app/actions/gl-actions';
import { AppShell } from '@/app/components/layout/AppShell';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Badge } from '@/app/components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/app/components/ui/Table';
import { Select } from '@/app/components/ui/Select';
import { Modal } from '@/app/components/ui/Modal';
import { Card } from '@/app/components/ui/Card';
import { useToast } from '@/app/components/ui/Toast';
import { Plus, Edit, Search, BookOpen, List, GitBranch, ChevronRight, ChevronDown } from 'lucide-react';

interface GLAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  account_group: string;
  normal_balance: string;
  current_balance: number;
  tally_ledger_name: string | null;
  tally_group: string | null;
  is_active: boolean;
  parent_id: string | null;
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'Asset', label: 'Asset' },
  { value: 'Liability', label: 'Liability' },
  { value: 'Equity', label: 'Equity' },
  { value: 'Revenue', label: 'Revenue' },
  { value: 'Expense', label: 'Expense' },
];

const FILTER_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'Asset', label: 'Assets' },
  { value: 'Liability', label: 'Liabilities' },
  { value: 'Equity', label: 'Equity' },
  { value: 'Revenue', label: 'Revenue' },
  { value: 'Expense', label: 'Expenses' },
];

const NORMAL_BALANCE_OPTIONS = [
  { value: 'Debit', label: 'Debit' },
  { value: 'Credit', label: 'Credit' },
];

const ACCOUNT_TYPE_BADGE: Record<string, 'info' | 'danger' | 'purple' | 'success' | 'warning' | 'neutral'> = {
  Asset: 'info',
  Liability: 'danger',
  Equity: 'purple',
  Revenue: 'success',
  Expense: 'warning',
};

const defaultForm = {
  account_code: '',
  account_name: '',
  account_type: 'Asset' as 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense',
  account_group: '',
  parent_id: '' as string,
  normal_balance: 'Debit' as 'Debit' | 'Credit',
  opening_balance: 0,
  tally_ledger_name: '',
  tally_group: '',
  is_active: true,
};

export default function ChartOfAccountsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<GLAccount | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [orgId, setOrgId] = useState('');
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('flat');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/session')
      .then(r => r.json())
      .then(s => { if (s?.organization_id) setOrgId(s.organization_id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (orgId) loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, orgId]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const result = await getGLAccounts(
        orgId,
        filterType !== 'all' ? { account_type: filterType } : undefined
      );
      if (result.success) {
        setAccounts(result.accounts as GLAccount[]);
      } else {
        toast.error('Failed to load accounts');
      }
    } catch {
      toast.error('Error loading accounts');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(defaultForm);
    setEditingAccount(null);
  };

  const openNewModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleEdit = (account: GLAccount) => {
    setEditingAccount(account);
    setFormData({
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type as typeof defaultForm.account_type,
      account_group: account.account_group,
      parent_id: account.parent_id || '',
      normal_balance: account.normal_balance as typeof defaultForm.normal_balance,
      opening_balance: 0,
      tally_ledger_name: account.tally_ledger_name || '',
      tally_group: account.tally_group || '',
      is_active: account.is_active,
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingAccount) {
        const result = await updateGLAccount(editingAccount.id, {
          ...formData,
          parent_id: formData.parent_id || null,
        });
        if (result.success) {
          toast.success('Account updated successfully');
          handleCloseModal();
          loadAccounts();
        } else {
          toast.error(result.error || 'Failed to update account');
        }
      } else {
        const result = await createGLAccount({
          organizationId: orgId,
          ...formData,
          parent_id: formData.parent_id || undefined,
        });
        if (result.success) {
          toast.success('Account created successfully');
          handleCloseModal();
          loadAccounts();
        } else {
          toast.error(result.error || 'Failed to create account');
        }
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  // Accounts eligible to be this account's parent: exclude itself and any of
  // its own descendants (prevents creating a cycle in the tree).
  const eligibleParents = (() => {
    if (!editingAccount) return accounts;
    const excluded = new Set<string>([editingAccount.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const acc of accounts) {
        if (acc.parent_id && excluded.has(acc.parent_id) && !excluded.has(acc.id)) {
          excluded.add(acc.id);
          changed = true;
        }
      }
    }
    return accounts.filter((a) => !excluded.has(a.id));
  })();

  const childrenByParent = new Map<string, GLAccount[]>();
  for (const acc of accounts) {
    const key = acc.parent_id || '__root__';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(acc);
  }
  const rootAccounts = childrenByParent.get('__root__') || [];

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderTreeRows = (nodes: GLAccount[], depth: number): React.ReactNode[] => {
    const term = searchTerm.toLowerCase();
    return nodes.flatMap((account) => {
      const children = childrenByParent.get(account.id) || [];
      const isCollapsed = collapsedIds.has(account.id);
      const matchesSearch = !term ||
        account.account_code.toLowerCase().includes(term) ||
        account.account_name.toLowerCase().includes(term);
      const rows: React.ReactNode[] = [];
      if (matchesSearch || children.length > 0) {
        rows.push(
          <TableRow key={account.id}>
            <TableCell>
              <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
                {children.length > 0 ? (
                  <button type="button" onClick={() => toggleCollapsed(account.id)} className="text-gray-400 hover:text-gray-600">
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <span className="w-3.5 inline-block" />
                )}
                <span className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200">
                  {account.account_code}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <span className="font-medium text-gray-900">{account.account_name}</span>
            </TableCell>
            <TableCell>
              <Badge variant={ACCOUNT_TYPE_BADGE[account.account_type] ?? 'neutral'}>
                {account.account_type}
              </Badge>
            </TableCell>
            <TableCell>
              <span className="font-mono text-sm text-gray-800">
                {account.current_balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={account.is_active ? 'success' : 'neutral'} dot>
                {account.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" icon={<Edit className="w-3.5 h-3.5" />} onClick={() => handleEdit(account)}>
                Edit
              </Button>
            </TableCell>
          </TableRow>
        );
      }
      if (!isCollapsed) {
        rows.push(...renderTreeRows(children, depth + 1));
      }
      return rows;
    });
  };

  const filteredAccounts = accounts.filter((account) => {
    const term = searchTerm.toLowerCase();
    return (
      account.account_code.toLowerCase().includes(term) ||
      account.account_name.toLowerCase().includes(term)
    );
  });

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chart of Accounts</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage your general ledger accounts</p>
          </div>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openNewModal}>
            New Account
          </Button>
        </div>

        {/* Filters */}
        <Card padding="none">
          <div className="p-4 flex flex-wrap gap-3 items-center border-b border-gray-100">
            <div className="flex-1 min-w-48">
              <Input
                placeholder="Search by code or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="w-44">
              <Select
                value={filterType}
                options={FILTER_TYPE_OPTIONS}
                onChange={(e) => setFilterType(e.target.value)}
              />
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${viewMode === 'flat' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <List className="w-3.5 h-3.5" /> Flat
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 border-l border-gray-200 ${viewMode === 'tree' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <GitBranch className="w-3.5 h-3.5" /> Tree
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-400">Loading accounts...</div>
          ) : viewMode === 'tree' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell header>Code</TableCell>
                  <TableCell header>Account Name</TableCell>
                  <TableCell header>Type</TableCell>
                  <TableCell header>Balance</TableCell>
                  <TableCell header>Status</TableCell>
                  <TableCell header>Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rootAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell>
                      <div className="py-8 text-center text-sm text-gray-400">No accounts found.</div>
                    </TableCell>
                  </TableRow>
                ) : (
                  renderTreeRows(rootAccounts, 0)
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell header>Code</TableCell>
                  <TableCell header>Account Name</TableCell>
                  <TableCell header>Type</TableCell>
                  <TableCell header>Group</TableCell>
                  <TableCell header>Normal Balance</TableCell>
                  <TableCell header>Balance</TableCell>
                  <TableCell header>Tally Mapping</TableCell>
                  <TableCell header>Status</TableCell>
                  <TableCell header>Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell>
                      <div className="py-8 text-center text-sm text-gray-400 col-span-9">
                        No accounts found. Create your first account to get started.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <span className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200">
                          {account.account_code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-gray-900">{account.account_name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ACCOUNT_TYPE_BADGE[account.account_type] ?? 'neutral'}>
                          {account.account_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{account.account_group || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{account.normal_balance}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-gray-800">
                          {account.current_balance.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {account.tally_ledger_name || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.is_active ? 'success' : 'neutral'} dot>
                          {account.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Edit className="w-3.5 h-3.5" />}
                          onClick={() => handleEdit(account)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          {!loading && (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {filteredAccounts.length} of {accounts.length} accounts
            </div>
          )}
        </Card>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingAccount ? 'Edit Account' : 'New GL Account'}
        icon={<BookOpen className="w-4 h-4" />}
        maxWidth="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Account Code *"
              value={formData.account_code}
              onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
              required
              disabled={!!editingAccount}
              placeholder="e.g. 1001"
            />
            <Input
              label="Account Name *"
              value={formData.account_name}
              onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
              required
              placeholder="e.g. Cash in Hand"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Account Type *"
              value={formData.account_type}
              options={ACCOUNT_TYPE_OPTIONS}
              onChange={(e) =>
                setFormData({ ...formData, account_type: e.target.value as typeof defaultForm.account_type })
              }
              required
            />
            <Input
              label="Account Group"
              value={formData.account_group}
              onChange={(e) => setFormData({ ...formData, account_group: e.target.value })}
              placeholder="e.g. Current Assets"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Parent Account (Group)"
              value={formData.parent_id}
              options={[
                { value: '', label: '— No parent (top-level) —' },
                ...eligibleParents
                  .slice()
                  .sort((a, b) => a.account_code.localeCompare(b.account_code))
                  .map((a) => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` })),
              ]}
              onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
            />
            {editingAccount ? (
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Active
                </label>
              </div>
            ) : (
              <Input
                label="Opening Balance"
                type="number"
                step="0.01"
                value={formData.opening_balance}
                onChange={(e) =>
                  setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })
                }
                placeholder="0.00"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Normal Balance *"
              value={formData.normal_balance}
              options={NORMAL_BALANCE_OPTIONS}
              onChange={(e) =>
                setFormData({ ...formData, normal_balance: e.target.value as typeof defaultForm.normal_balance })
              }
              required
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Tally Mapping (Optional)
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Tally Ledger Name"
                value={formData.tally_ledger_name}
                onChange={(e) => setFormData({ ...formData, tally_ledger_name: e.target.value })}
                placeholder="e.g. Cash"
              />
              <Input
                label="Tally Group"
                value={formData.tally_group}
                onChange={(e) => setFormData({ ...formData, tally_group: e.target.value })}
                placeholder="e.g. Cash-in-hand"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {editingAccount ? 'Update Account' : 'Create Account'}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
