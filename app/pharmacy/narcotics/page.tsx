'use client';

import { useEffect, useState } from 'react';
import { getNarcoticRegister, addNarcoticEntry } from '@/app/actions/pharmacy-actions';
import { useToast } from '@/app/components/ui/Toast';

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
    loadEntries();
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Controlled Substance Register</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track narcotic and controlled drug transactions</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          + Add Entry
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400 font-medium">Filter by Drug:</label>
        <select
          value={filterDrug}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All Drugs</option>
          {uniqueDrugs.map((drug) => (
            <option key={drug} value={drug}>{drug}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-800/50">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Date</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Drug</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Patient</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Prescriber</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Witness</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">In</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Out</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Balance</th>
              <th className="text-center px-4 py-3 text-gray-400 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-500">Loading...</td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-500">No entries found</td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{entry.drug_name}</td>
                  <td className="px-4 py-3 text-gray-300">{entry.patient_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{entry.prescriber_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{entry.witness_name || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                    {entry.quantity_in > 0 ? entry.quantity_in : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-400">
                    {entry.quantity_out > 0 ? entry.quantity_out : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-bold">{entry.balance}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      entry.transaction_type === 'IN'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
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

      {/* Add Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Add Narcotic Entry</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Drug Name *</label>
                  <input
                    value={form.drug_name}
                    onChange={(e) => setForm({ ...form, drug_name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. Morphine 10mg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Batch No</label>
                  <input
                    value={form.batch_no}
                    onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Transaction Type *</label>
                  <select
                    value={form.transaction_type}
                    onChange={(e) => setForm({ ...form, transaction_type: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="IN">IN (Stock Receipt)</option>
                    <option value="OUT">OUT (Dispensed)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Patient Name</label>
                  <input
                    value={form.patient_name}
                    onChange={(e) => setForm({ ...form, patient_name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Prescriber Name</label>
                  <input
                    value={form.prescriber_name}
                    onChange={(e) => setForm({ ...form, prescriber_name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Witness Name</label>
                  <input
                    value={form.witness_name}
                    onChange={(e) => setForm({ ...form, witness_name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
