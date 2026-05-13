'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Network, Plus, Loader2, X, Check, UserCheck } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getReferralNetwork, addReferralDoctor } from '@/app/actions/crm-actions';

export default function ReferralsPage() {
  const toast = useToast();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    doctorName: '', specialty: '', hospital: '', phone: '', email: '', payoutPercentage: '',
  });

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    const res = await getReferralNetwork();
    if (res.success) setReferrals(res.data as any[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadReferrals(); }, [loadReferrals]);

  const handleAdd = async () => {
    if (!form.doctorName) {
      toast.error('Doctor name is required');
      return;
    }
    setSaving(true);
    const res = await addReferralDoctor({
      ...form,
      payoutPercentage: form.payoutPercentage ? parseFloat(form.payoutPercentage) : undefined,
    });
    setSaving(false);
    if (res.success) {
      toast.success('Referring doctor added');
      setShowModal(false);
      setForm({ doctorName: '', specialty: '', hospital: '', phone: '', email: '', payoutPercentage: '' });
      loadReferrals();
    } else {
      toast.error('Failed to add doctor');
    }
  };

  const headerActions = (
    <button
      onClick={() => setShowModal(true)}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md"
    >
      <Plus className="h-3.5 w-3.5" /> Add Referring Doctor
    </button>
  );

  return (
    <AppShell pageTitle="Referral Network" pageIcon={<Network className="h-5 w-5" />} headerActions={headerActions} onRefresh={loadReferrals} refreshing={loading}>
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {['Doctor Name', 'Specialty', 'Hospital', 'Phone', 'Referrals', 'Last Referral', 'Payout %', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-500 mx-auto" />
                </td></tr>
              ) : referrals.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16">
                  <Network className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No referring doctors yet</p>
                </td></tr>
              ) : referrals.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                        <UserCheck className="h-3.5 w-3.5 text-teal-600" />
                      </div>
                      <span className="font-medium text-gray-900">{r.doctor_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.specialty || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.hospital || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{r.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-lg font-black text-gray-900">{r.referral_count}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {r.last_referral ? new Date(r.last_referral).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-medium text-xs">
                    {r.payout_percentage != null ? `${r.payout_percentage}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${r.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Doctor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Add Referring Doctor</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Doctor Name *</label>
                <input
                  type="text"
                  value={form.doctorName}
                  onChange={e => setForm(f => ({ ...f, doctorName: e.target.value }))}
                  placeholder="Dr. Rajesh Kumar"
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Specialty</label>
                  <input
                    type="text"
                    value={form.specialty}
                    onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                    placeholder="e.g., Cardiology"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Hospital</label>
                  <input
                    type="text"
                    value={form.hospital}
                    onChange={e => setForm(f => ({ ...f, hospital: e.target.value }))}
                    placeholder="Hospital name"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="Mobile number"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Payout %</label>
                  <input
                    type="number"
                    value={form.payoutPercentage}
                    onChange={e => setForm(f => ({ ...f, payoutPercentage: e.target.value }))}
                    placeholder="e.g., 5"
                    min="0"
                    max="100"
                    step="0.5"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="doctor@example.com"
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Add Doctor
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
