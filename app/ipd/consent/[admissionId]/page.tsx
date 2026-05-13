'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { FileText, Plus, X } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { useParams } from 'next/navigation';
import { addPatientConsent, getPatientConsents } from '@/app/actions/ipd-enhancement-actions';

const CONSENT_TYPES = ['Admission', 'Surgery', 'Anesthesia', 'Blood', 'LAMA', 'Procedure'];

const TYPE_COLORS: Record<string, string> = {
  Admission: 'bg-blue-50 text-blue-700',
  Surgery: 'bg-red-50 text-red-700',
  Anesthesia: 'bg-purple-50 text-purple-700',
  Blood: 'bg-rose-50 text-rose-700',
  LAMA: 'bg-amber-50 text-amber-700',
  Procedure: 'bg-indigo-50 text-indigo-700',
};

export default function ConsentPage() {
  const params = useParams();
  const toast = useToast();
  const admissionId = params.admissionId as string;

  const [consents, setConsents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    consentType: 'Admission',
    witnessName: '',
    notes: '',
  });

  const loadConsents = async () => {
    setLoading(true);
    const res = await getPatientConsents(admissionId);
    if (res.success) setConsents(res.data as any[]);
    setLoading(false);
  };

  useEffect(() => { loadConsents(); }, [admissionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await addPatientConsent({
      admissionId,
      consentType: form.consentType,
      witnessName: form.witnessName || undefined,
      notes: form.notes || undefined,
    });
    if (res.success) {
      toast.success('Consent recorded');
      setModalOpen(false);
      setForm({ consentType: 'Admission', witnessName: '', notes: '' });
      loadConsents();
    } else {
      toast.error((res as any).error || 'Failed to add consent');
    }
    setSaving(false);
  };

  return (
    <AppShell
      pageTitle="Patient Consents"
      pageIcon={<FileText className="h-5 w-5" />}
      onRefresh={loadConsents}
      refreshing={loading}
    >
      <div className="mb-4 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500">Admission: <strong className="text-gray-700 font-mono">{admissionId}</strong></p>
          <p className="text-xs text-gray-400 mt-0.5">{consents.length} consent(s) on record</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add Consent
        </button>
      </div>

      {/* Consent List */}
      <div className="space-y-3">
        {consents.length === 0 && !loading && (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-400 text-sm shadow-sm">
            No consents recorded for this admission
          </div>
        )}
        {consents.map(c => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${TYPE_COLORS[c.consent_type] || 'bg-gray-100 text-gray-600'}`}>
                  {c.consent_type}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {c.signed_at ? new Date(c.signed_at).toLocaleString('en-IN') : '—'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div>
                <span className="text-gray-400 uppercase tracking-wide font-semibold">Witness</span>
                <p className="font-bold text-gray-700 mt-0.5">{c.witness_name || '—'}</p>
              </div>
              {c.notes && (
                <div className="col-span-2">
                  <span className="text-gray-400 uppercase tracking-wide font-semibold">Notes</span>
                  <p className="text-gray-600 mt-0.5">{c.notes}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Consent Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal-600" /> Add Patient Consent
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Consent Type *</label>
                <select required value={form.consentType} onChange={e => setForm(f => ({ ...f, consentType: e.target.value }))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none bg-white">
                  {CONSENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Witness Name</label>
                <input value={form.witnessName} onChange={e => setForm(f => ({ ...f, witnessName: e.target.value }))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none" placeholder="Witness full name" />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none min-h-[72px]" placeholder="Additional notes..." />
              </div>
              <button disabled={saving} type="submit"
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold p-3 rounded-xl shadow-md transition-all">
                {saving ? 'Saving...' : 'Record Consent'}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
