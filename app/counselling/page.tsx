'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Plus, Loader2, X, Check } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import {
  getCounsellingSessions,
  createCounsellingSession,
  updateCounsellingStatus,
} from '@/app/actions/counselling-actions';

const SESSION_TYPES = ['Financial', 'Medical', 'Psychological', 'Social'];
const STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];

const statusColors: Record<string, string> = {
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  'In Progress': 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const FILTER_TABS = ['All', 'Scheduled', 'In Progress', 'Completed'];

export default function CounsellingPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [createForm, setCreateForm] = useState({
    patientId: '',
    counsellorName: '',
    sessionType: '',
    scheduledAt: '',
    financialEstimate: '',
    depositAdvised: '',
  });

  const [updateForm, setUpdateForm] = useState({
    status: '',
    outcome: '',
  });

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const statusFilter = activeTab === 'All' ? undefined : activeTab;
    const res = await getCounsellingSessions(statusFilter);
    if (res.success) setSessions(res.data as any[]);
    setLoading(false);
  }, [activeTab]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleCreate = async () => {
    if (!createForm.patientId || !createForm.sessionType) {
      toast.error('Patient ID and session type are required');
      return;
    }
    setSaving(true);
    const res = await createCounsellingSession({
      patientId: createForm.patientId,
      counsellorName: createForm.counsellorName || undefined,
      sessionType: createForm.sessionType,
      scheduledAt: createForm.scheduledAt || undefined,
      financialEstimate: createForm.financialEstimate ? Number(createForm.financialEstimate) : undefined,
      depositAdvised: createForm.depositAdvised ? Number(createForm.depositAdvised) : undefined,
    });
    setSaving(false);
    if (res.success) {
      toast.success('Session created');
      setShowCreateModal(false);
      setCreateForm({ patientId: '', counsellorName: '', sessionType: '', scheduledAt: '', financialEstimate: '', depositAdvised: '' });
      loadSessions();
    } else {
      toast.error('Failed to create session');
    }
  };

  const handleUpdate = async () => {
    if (!updateForm.status || !selectedSession) return;
    setSaving(true);
    const res = await updateCounsellingStatus(selectedSession.id, updateForm.status, updateForm.outcome || undefined);
    setSaving(false);
    if (res.success) {
      toast.success('Status updated');
      setShowUpdateModal(false);
      setSelectedSession(null);
      setUpdateForm({ status: '', outcome: '' });
      loadSessions();
    } else {
      toast.error('Failed to update status');
    }
  };

  const openUpdateModal = (session: any) => {
    setSelectedSession(session);
    setUpdateForm({ status: session.status, outcome: session.outcome || '' });
    setShowUpdateModal(true);
  };

  const total = sessions.length;
  const scheduled = sessions.filter(s => s.status === 'Scheduled').length;
  const inProgress = sessions.filter(s => s.status === 'In Progress').length;
  const completed = sessions.filter(s => s.status === 'Completed').length;

  const headerActions = (
    <button
      onClick={() => setShowCreateModal(true)}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md"
    >
      <Plus className="h-3.5 w-3.5" /> New Session
    </button>
  );

  return (
    <AppShell pageTitle="Counselling Sessions" pageIcon={<MessageSquare className="h-5 w-5" />} headerActions={headerActions} onRefresh={loadSessions} refreshing={loading}>
      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: total, color: 'text-gray-900' },
            { label: 'Scheduled', value: scheduled, color: 'text-blue-700' },
            { label: 'In Progress', value: inProgress, color: 'text-amber-700' },
            { label: 'Completed', value: completed, color: 'text-emerald-700' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-teal-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Patient ID', 'Counsellor', 'Type', 'Scheduled At', 'Financial Est.', 'Deposit Advised', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-teal-500 mx-auto" />
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16">
                      <MessageSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">No sessions found</p>
                    </td>
                  </tr>
                ) : sessions.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 text-xs font-mono">{s.patient_id}</td>
                    <td className="px-4 py-3 text-gray-700">{s.counsellor_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{s.session_type}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {s.financial_estimate ? `₹${Number(s.financial_estimate).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {s.deposit_advised ? `₹${Number(s.deposit_advised).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusColors[s.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openUpdateModal(s)}
                        className="text-xs font-bold text-teal-600 hover:text-teal-800 transition-colors"
                      >
                        Update Status
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">New Counselling Session</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Patient ID *</label>
                <input
                  type="text"
                  value={createForm.patientId}
                  onChange={e => setCreateForm(f => ({ ...f, patientId: e.target.value }))}
                  placeholder="e.g., PAT-001"
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Session Type *</label>
                  <select
                    value={createForm.sessionType}
                    onChange={e => setCreateForm(f => ({ ...f, sessionType: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                  >
                    <option value="">Select type</option>
                    {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Counsellor Name</label>
                  <input
                    type="text"
                    value={createForm.counsellorName}
                    onChange={e => setCreateForm(f => ({ ...f, counsellorName: e.target.value }))}
                    placeholder="e.g., Dr. Sharma"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Scheduled At</label>
                <input
                  type="datetime-local"
                  value={createForm.scheduledAt}
                  onChange={e => setCreateForm(f => ({ ...f, scheduledAt: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Financial Estimate (₹)</label>
                  <input
                    type="number"
                    value={createForm.financialEstimate}
                    onChange={e => setCreateForm(f => ({ ...f, financialEstimate: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Deposit Advised (₹)</label>
                  <input
                    type="number"
                    value={createForm.depositAdvised}
                    onChange={e => setCreateForm(f => ({ ...f, depositAdvised: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Status Modal */}
      {showUpdateModal && selectedSession && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowUpdateModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Update Session Status</h2>
              <button onClick={() => setShowUpdateModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Status</label>
                <select
                  value={updateForm.status}
                  onChange={e => setUpdateForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Outcome / Notes</label>
                <textarea
                  value={updateForm.outcome}
                  onChange={e => setUpdateForm(f => ({ ...f, outcome: e.target.value }))}
                  rows={3}
                  placeholder="Session outcome or notes..."
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
