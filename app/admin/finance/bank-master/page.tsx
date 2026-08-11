'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AdminPage } from '@/app/admin/components/AdminPage';
import {
  Building2, Plus, Pencil, Loader2, Search, CheckCircle2, AlertCircle,
  ToggleLeft, ToggleRight, CreditCard, RefreshCw, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listHospitalBankAccounts,
  createHospitalBankAccount,
  updateHospitalBankAccount,
  toggleHospitalBankAccountStatus,
} from '@/app/actions/bank-master-actions';

interface BankAccount {
  id: number;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  branch_name: string | null;
  account_holder_name: string;
  bank_upi_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM = {
  bank_name: '',
  account_number: '',
  ifsc_code: '',
  branch_name: '',
  account_holder_name: '',
  bank_upi_id: '',
  is_active: true,
};

const labelCls = 'block text-xs uppercase tracking-wider font-bold text-gray-500 mb-1';
const inputCls = 'w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium outline-none transition-colors';

export default function BankMasterPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listHospitalBankAccounts();
      if (res.success && res.data) {
        setAccounts(res.data);
      } else {
        toast.error(res.error || 'Failed to load bank accounts');
      }
    } catch (err: any) {
      toast.error('An error occurred while loading data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (acc: BankAccount) => {
    setEditingId(acc.id);
    setForm({
      bank_name: acc.bank_name || '',
      account_number: acc.account_number || '',
      ifsc_code: acc.ifsc_code || '',
      branch_name: acc.branch_name || '',
      account_holder_name: acc.account_holder_name || '',
      bank_upi_id: acc.bank_upi_id || '',
      is_active: acc.is_active,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bank_name.trim()) { toast.error('Bank Name is required'); return; }
    if (!form.account_number.trim()) { toast.error('Account Number is required'); return; }
    if (!form.ifsc_code.trim()) { toast.error('IFSC Code is required'); return; }
    if (!form.account_holder_name.trim()) { toast.error('Account Holder Name is required'); return; }

    setSubmitting(true);
    try {
      if (editingId) {
        const res = await updateHospitalBankAccount(editingId, form);
        if (res.success) {
          toast.success('Bank account updated successfully');
          closeModal();
          loadData();
        } else {
          toast.error(res.error || 'Failed to update bank account');
        }
      } else {
        const res = await createHospitalBankAccount(form);
        if (res.success) {
          toast.success('Bank account created successfully');
          closeModal();
          loadData();
        } else {
          toast.error(res.error || 'Failed to create bank account');
        }
      }
    } catch (err: any) {
      toast.error('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (acc: BankAccount) => {
    try {
      const res = await toggleHospitalBankAccountStatus(acc.id);
      if (res.success) {
        toast.success(`Bank account ${acc.is_active ? 'deactivated' : 'activated'}`);
        loadData();
      } else {
        toast.error(res.error || 'Failed to toggle status');
      }
    } catch (err) {
      toast.error('Failed to change bank account status');
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      acc.bank_name.toLowerCase().includes(q) ||
      acc.account_number.toLowerCase().includes(q) ||
      acc.ifsc_code.toLowerCase().includes(q) ||
      acc.account_holder_name.toLowerCase().includes(q) ||
      (acc.branch_name && acc.branch_name.toLowerCase().includes(q))
    );
  });

  return (
    <AdminPage
      pageTitle="Bank Master"
      pageIcon={<Building2 className="h-5 w-5" />}
    >
      <div className="max-w-6xl mx-auto pb-12">
        {/* Top Header Card */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-6">
          <div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" /> Hospital Bank Accounts
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Manage hospital bank accounts for TPA receipt generation and billing remittances.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              title="Refresh"
              className="p-2.5 text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add Bank Account
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by bank name, account number, IFSC code, holder..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
          />
        </div>

        {/* Bank List Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mr-3 text-emerald-600" /> Loading bank accounts...
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-gray-600">No bank accounts found</p>
              <p className="text-xs mt-1">
                {searchQuery ? 'No accounts match your search query.' : 'Click "Add Bank Account" to create your first bank account.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 text-[11px] font-bold uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3">Bank Name & Branch</th>
                    <th className="px-5 py-3">Account Holder</th>
                    <th className="px-5 py-3">Account Number</th>
                    <th className="px-5 py-3">IFSC Code</th>
                    <th className="px-5 py-3">UPI ID</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {filteredAccounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-gray-900">{acc.bank_name}</div>
                        {acc.branch_name && (
                          <div className="text-xs text-gray-400">{acc.branch_name}</div>
                        )}
                      </td>
                      <td className="px-5 py-4 font-medium text-gray-700">
                        {acc.account_holder_name}
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-gray-900">
                        {acc.account_number}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md inline-block my-3">
                        {acc.ifsc_code}
                      </td>
                      <td className="px-5 py-4 text-xs font-mono text-gray-500">
                        {acc.bank_upi_id || '—'}
                      </td>
                      <td className="px-5 py-4">
                        {acc.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(acc)}
                            title="Edit"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(acc)}
                            title={acc.is_active ? 'Deactivate' : 'Activate'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              acc.is_active
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {acc.is_active ? (
                              <ToggleRight className="h-5 w-5" />
                            ) : (
                              <ToggleLeft className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Form for Create / Edit */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-150">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-emerald-600" />
                  {editingId ? 'Edit Bank Account' : 'Add New Bank Account'}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className={labelCls}>Bank Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Bank, State Bank of India"
                    value={form.bank_name}
                    onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                    className={inputCls}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Account Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 5010012345678"
                      value={form.account_number}
                      onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>IFSC Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. HDFC0001234"
                      value={form.ifsc_code}
                      onChange={(e) => setForm({ ...form, ifsc_code: e.target.value.toUpperCase() })}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Account Holder Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. City Care Hospital Pvt Ltd"
                    value={form.account_holder_name}
                    onChange={(e) => setForm({ ...form, account_holder_name: e.target.value })}
                    className={inputCls}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Branch Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Main Branch, Anna Nagar"
                      value={form.branch_name}
                      onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Bank UPI ID (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. hospital@hdfcbank"
                      value={form.bank_upi_id}
                      onChange={(e) => setForm({ ...form, bank_upi_id: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 text-emerald-600 rounded accent-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="is_active" className="text-sm font-semibold text-gray-700 cursor-pointer">
                    Active Account (available in TPA billing dropdown)
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingId ? 'Save Changes' : 'Create Bank Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
