'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { ShieldCheck, ChevronLeft, Pill, FlaskConical, DollarSign, Heart, Stethoscope, X } from 'lucide-react';
import { useToast } from '@/app/components/ui/Toast';
import { useParams, useRouter } from 'next/navigation';
import { initDischargeClearance, getDischargeClearance, updateClearanceDept } from '@/app/actions/ipd-enhancement-actions';

type Dept = 'pharmacy' | 'lab' | 'finance' | 'nursing' | 'doctor';

const DEPT_CONFIG: { key: Dept; label: string; icon: React.ElementType }[] = [
  { key: 'pharmacy', label: 'Pharmacy', icon: Pill },
  { key: 'lab', label: 'Laboratory', icon: FlaskConical },
  { key: 'finance', label: 'Finance', icon: DollarSign },
  { key: 'nursing', label: 'Nursing', icon: Heart },
  { key: 'doctor', label: 'Doctor', icon: Stethoscope },
];

function statusBadge(status: string | null) {
  if (status === 'Cleared') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">Cleared</span>;
  if (status === 'Waived') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">Waived</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">Pending</span>;
}

export default function ClearancePage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const admissionId = params.admissionId as string;

  const [clearance, setClearance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<{ dept: Dept; type: 'Cleared' | 'Waived' } | null>(null);
  const [staffName, setStaffName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadClearance = async () => {
    setLoading(true);
    await initDischargeClearance(admissionId);
    const res = await getDischargeClearance(admissionId);
    if (res.success) setClearance(res.data);
    setLoading(false);
  };

  useEffect(() => { loadClearance(); }, [admissionId]);

  const clearedCount = clearance
    ? DEPT_CONFIG.filter(d => clearance[d.key] === 'Cleared' || clearance[d.key] === 'Waived').length
    : 0;

  const handleConfirm = async () => {
    if (!actionModal || !staffName.trim()) return;
    setSaving(true);
    const res = await updateClearanceDept(admissionId, actionModal.dept, actionModal.type, staffName.trim());
    if (res.success) {
      toast.success(`${actionModal.dept} marked as ${actionModal.type}`);
      setActionModal(null);
      setStaffName('');
      loadClearance();
    } else {
      toast.error((res as any).error || 'Failed to update');
    }
    setSaving(false);
  };

  return (
    <AppShell
      pageTitle="Discharge Clearance"
      pageIcon={<ShieldCheck className="h-5 w-5" />}
      onRefresh={loadClearance}
      refreshing={loading}
    >
      {/* Back button */}
      <div className="mb-4">
        <button
          onClick={() => router.push('/ipd/admissions')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Admissions
        </button>
      </div>

      {/* Status Banner */}
      {clearance && (
        <div className={`mb-6 rounded-2xl px-5 py-4 flex items-center gap-3 ${clearance.all_cleared ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          <ShieldCheck className={`h-6 w-6 shrink-0 ${clearance.all_cleared ? 'text-emerald-600' : 'text-amber-500'}`} />
          <div>
            <p className={`font-bold text-sm ${clearance.all_cleared ? 'text-emerald-800' : 'text-amber-800'}`}>
              {clearance.all_cleared
                ? 'All Departments Cleared — Ready for Discharge'
                : `${clearedCount} / 5 Departments Cleared`}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Admission: {admissionId}</p>
          </div>
        </div>
      )}

      {/* Department Cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {DEPT_CONFIG.map(({ key, label, icon: Icon }) => {
          const status = clearance?.[key] || null;
          const clearedBy = clearance?.[`${key}_by`];
          const clearedAt = clearance?.[`${key}_at`];
          const isDone = status === 'Cleared' || status === 'Waived';

          return (
            <div key={key} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-gray-50 rounded-xl">
                    <Icon className="h-5 w-5 text-gray-600" />
                  </div>
                  <span className="font-bold text-gray-900">{label}</span>
                </div>
                {statusBadge(status)}
              </div>
              {isDone && (
                <div className="text-xs text-gray-500 mb-3">
                  <span>By: <strong>{clearedBy}</strong></span>
                  {clearedAt && <span className="ml-2">at {new Date(clearedAt).toLocaleString('en-IN')}</span>}
                </div>
              )}
              {!isDone && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setActionModal({ dept: key, type: 'Cleared' })}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2 rounded-xl transition-colors"
                  >
                    Mark Cleared
                  </button>
                  <button
                    onClick={() => setActionModal({ dept: key, type: 'Waived' })}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 rounded-xl transition-colors"
                  >
                    Waive
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-900">Confirm {actionModal.type}</h3>
              <button onClick={() => { setActionModal(null); setStaffName(''); }} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                You are marking <strong className="capitalize">{actionModal.dept}</strong> as <strong>{actionModal.type}</strong>.
              </p>
              <div>
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Your Name *</label>
                <input
                  autoFocus
                  value={staffName}
                  onChange={e => setStaffName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none"
                  placeholder="Staff / Doctor name"
                />
              </div>
              <button
                disabled={saving || !staffName.trim()}
                onClick={handleConfirm}
                className={`w-full text-white font-bold p-3 rounded-xl shadow-md transition-all disabled:opacity-60 ${actionModal.type === 'Cleared' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                {saving ? 'Saving...' : `Confirm ${actionModal.type}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
