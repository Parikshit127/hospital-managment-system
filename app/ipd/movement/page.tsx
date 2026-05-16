'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { ArrowLeftRight, Plus, ArrowRight, X, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { getActiveMovements, recordPatientMovement, returnPatient } from '@/app/actions/ipd-enhancement-actions';

const DESTINATIONS = ['OT', 'Radiology', 'Dialysis', 'Physiotherapy', 'ICU', 'Lab', 'Pharmacy', 'Canteen', 'Other'];
const FROM_LOCATIONS = ['Ward', 'ICU', 'HDU', 'NICU', 'PICU', 'Emergency', 'Recovery Room', 'Day Care', 'Other'];

export default function MovementPage() {
  const toast = useToast();
  const [movements, setMovements] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [returning, setReturning] = useState<string | null>(null);

  const [form, setForm] = useState({
    admissionId: '', patientId: '', fromLocation: '',
    toLocation: 'OT', purpose: '', escortName: '',
  });

  const loadData = async () => {
    setRefreshing(true);
    const res = await getActiveMovements();
    if (res.success) setMovements(res.data as any[]);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await recordPatientMovement({
      admissionId: form.admissionId,
      patientId: form.patientId,
      fromLocation: form.fromLocation,
      toLocation: form.toLocation,
      purpose: form.purpose || undefined,
      escortName: form.escortName || undefined,
    });
    if (res.success) {
      toast.success('Movement recorded');
      setModalOpen(false);
      setForm({ admissionId: '', patientId: '', fromLocation: '', toLocation: 'OT', purpose: '', escortName: '' });
      loadData();
    } else {
      toast.error((res as any).error || 'Failed to record movement');
    }
    setSaving(false);
  };

  const handleReturn = async (id: string) => {
    setReturning(id);
    const res = await returnPatient(id);
    if (res.success) {
      toast.success('Patient marked as returned');
      loadData();
    } else {
      toast.error((res as any).error || 'Failed to update');
    }
    setReturning(null);
  };

  return (
    <AppShell
      pageTitle="Patient Movement Tracking"
      pageIcon={<ArrowLeftRight className="h-5 w-5" />}
      onRefresh={loadData}
      refreshing={refreshing}
    >
      {/* Active Out-of-Ward */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-gray-900 text-sm uppercase tracking-wide">
            Active Out-of-Ward ({movements.length})
          </h2>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Record Movement
          </button>
        </div>

        {movements.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-400 text-sm shadow-sm">
            No patients currently out of ward
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {movements.map(m => (
            <div key={m.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{m.admission_id}</span>
                <span className="text-xs text-gray-400">{m.moved_at ? new Date(m.moved_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
              </div>
              <div className="flex items-center gap-2 my-2">
                <span className="text-sm font-bold text-gray-700">{m.from_location}</span>
                <ArrowRight className="h-4 w-4 text-teal-500 shrink-0" />
                <span className="text-sm font-bold text-teal-700">{m.to_location}</span>
              </div>
              {m.purpose && <p className="text-xs text-gray-500 mb-1">Purpose: {m.purpose}</p>}
              {m.escort_name && <p className="text-xs text-gray-500 mb-2">Escort: {m.escort_name}</p>}
              <button
                onClick={() => handleReturn(m.id)}
                disabled={returning === m.id}
                className="w-full mt-2 inline-flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-2 rounded-xl transition-colors disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {returning === m.id ? 'Marking...' : 'Mark Returned'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Record Movement Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-teal-600" /> Record Patient Movement
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Admission ID *</label>
                  <input required
                    type="text" inputMode="text" autoComplete="off" spellCheck={false} maxLength={30}
                    value={form.admissionId}
                    onChange={e => setForm(f => ({ ...f, admissionId: e.target.value.replace(/[^a-zA-Z0-9\-]/g, '').toUpperCase() }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none" placeholder="IPD-XXXXXXXX-XXXX" />
                </div>
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Patient ID *</label>
                  <input required
                    type="text" inputMode="text" autoComplete="off" spellCheck={false} maxLength={30}
                    value={form.patientId}
                    onChange={e => setForm(f => ({ ...f, patientId: e.target.value.replace(/[^a-zA-Z0-9\-]/g, '').toUpperCase() }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none" placeholder="PT-XXXX" />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">From Location *</label>
                <select required value={form.fromLocation} onChange={e => setForm(f => ({ ...f, fromLocation: e.target.value }))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none bg-white">
                  <option value="">Select location</option>
                  {FROM_LOCATIONS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">To Location *</label>
                <select required value={form.toLocation} onChange={e => setForm(f => ({ ...f, toLocation: e.target.value }))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none bg-white">
                  {DESTINATIONS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Purpose</label>
                  <input
                    type="text" inputMode="text" maxLength={100}
                    value={form.purpose}
                    onChange={e => setForm(f => ({ ...f, purpose: e.target.value.replace(/[^a-zA-Z0-9\s.,\-()]/g, '') }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none" placeholder="e.g. MRI Scan" />
                </div>
                <div>
                  <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Escort Name</label>
                  <input
                    type="text" inputMode="text" maxLength={60}
                    value={form.escortName}
                    onChange={e => setForm(f => ({ ...f, escortName: e.target.value.replace(/[^a-zA-Z\s.\-']/g, '') }))}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none" placeholder="Staff name" />
                </div>
              </div>
              <button disabled={saving} type="submit"
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold p-3 rounded-xl shadow-md transition-all">
                {saving ? 'Recording...' : 'Record Movement'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
