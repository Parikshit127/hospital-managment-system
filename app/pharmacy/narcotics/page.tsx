'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { getNarcoticRegister, addNarcoticEntry } from '@/app/actions/pharmacy-actions';
import { useToast } from '@/app/components/ui/Toast';
import { Plus, ShieldCheck } from 'lucide-react';

interface NarcoticEntry {
  id: string;
  drug_name: string;
  batch_no: string | null;
  patient_name: string | null;
  prescriber_name: string | null;
  witness_name: string | null;
  quantity_in: number;
  quantity_out: number;
  balance: number;
  transaction_type: string;
  notes: string | null;
  created_at: string;
}

export default function NarcoticsRegisterPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<NarcoticEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDrug, setFilterDrug] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    drug_name: '',
    batch_no: '',
    patient_name: '',
    prescriber_name: '',
    witness_name: '',
    transaction_type: 'IN',
    quantity: '',
    notes: '',
  });

  async function loadEntries(drug?: string) {
    setLoading(true);
    const res = await getNarcoticRegister(drug || undefined);
    if (res.success) setEntries(res.data as NarcoticEntry[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEntries();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function handleFilterChange(val: string) {
    setFilterDrug(val);
    loadEntries(val || undefined);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.drug_name || !form.quantity || !form.transaction_type) {
      toast.error('Drug name, quantity and type are required');
      return;
    }
    setSubmitting(true);
    const qty = parseFloat(form.quantity);
    const res = await addNarcoticEntry({
      drug_name: form.drug_name,
      batch_no: form.batch_no || undefined,
      patient_name: form.patient_name || undefined,
      prescriber_name: form.prescriber_name || undefined,
      witness_name: form.witness_name || undefined,
      quantity_in: form.transaction_type === 'IN' ? qty : 0,
      quantity_out: form.transaction_type === 'OUT' ? qty : 0,
      transaction_type: form.transaction_type,
      notes: form.notes || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      toast.success('Entry added successfully');
      setShowModal(false);
      setForm({ drug_name: '', batch_no: '', patient_name: '', prescriber_name: '', witness_name: '', transaction_type: 'IN', quantity: '', notes: '' });
      loadEntries(filterDrug || undefined);
    } else {
      toast.error('Failed to add entry');
    }
  }

  const uniqueDrugs = Array.from(new Set(entries.map((e) => e.drug_name)));

  return (
    <AppShell
      pageTitle="Controlled Substance Register"
      pageIcon={<ShieldCheck className="h-5 w-5" />}
      onRefresh={() => loadEntries(filterDrug || undefined)}
      refreshing={loading}
      headerActions={
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow-sm transition-all text-sm"
        >
          <Plus className="h-4 w-4" />
          Add Entry
        </button>
      }
    >

      {/* Filter */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="text-sm text-gray-600 font-bold">Filter by Drug</label>
        <select
          value={filterDrug}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="w-full sm:w-72 bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        >
          <option value="">All Drugs</option>
          {uniqueDrugs.map((drug) => (
            <option key={drug} value={drug}>{drug}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-wider">Date</th>
                <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-wider">Drug</th>
                <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-wider">Patient</th>
                <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-wider">Prescriber</th>
                <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-wider">Witness</th>
                <th className="text-right px-6 py-4 font-bold text-xs uppercase tracking-wider">In</th>
                <th className="text-right px-6 py-4 font-bold text-xs uppercase tracking-wider">Out</th>
                <th className="text-right px-6 py-4 font-bold text-xs uppercase tracking-wider">Balance</th>
                <th className="text-center px-6 py-4 font-bold text-xs uppercase tracking-wider">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500 font-medium">Loading...</td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500 font-medium">No entries found.</td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-500 text-xs font-medium">
                      {new Date(entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-bold">{entry.drug_name}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{entry.patient_name || '-'}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{entry.prescriber_name || '-'}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{entry.witness_name || '-'}</td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-600">
                      {entry.quantity_in > 0 ? entry.quantity_in : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-rose-600">
                      {entry.quantity_out > 0 ? entry.quantity_out : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-900 font-black">{entry.balance}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${
                        entry.transaction_type === 'IN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {entry.transaction_type}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Add Narcotic Entry</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-900 transition-colors text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">Drug Name *</label>
                  <input
                    value={form.drug_name}
                    onChange={(e) => setForm({ ...form, drug_name: e.target.value })}
                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    placeholder="e.g. Morphine 10mg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Batch No</label>
                  <input
                    value={form.batch_no}
                    onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Transaction Type *</label>
                  <select
                    value={form.transaction_type}
                    onChange={(e) => setForm({ ...form, transaction_type: e.target.value })}
                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    <option value="IN">IN (Stock Receipt)</option>
                    <option value="OUT">OUT (Dispensed)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Patient Name</label>
                  <input
                    value={form.patient_name}
                    onChange={(e) => setForm({ ...form, patient_name: e.target.value })}
                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Prescriber Name</label>
                  <input
                    value={form.prescriber_name}
                    onChange={(e) => setForm({ ...form, prescriber_name: e.target.value })}
                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">Witness Name</label>
                  <input
                    value={form.witness_name}
                    onChange={(e) => setForm({ ...form, witness_name: e.target.value })}
                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-bold bg-orange-600 hover:bg-orange-700 text-white transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
