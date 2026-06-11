'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Megaphone, Plus, Loader2, X, Check } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getCampaigns, createCampaign } from '@/app/actions/crm-actions';

const CAMPAIGN_TYPES = ['WhatsApp', 'SMS', 'Email'];

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600 border-gray-200',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  Running: 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const typeColors: Record<string, string> = {
  WhatsApp: 'bg-green-50 text-green-700 border-green-200',
  SMS: 'bg-blue-50 text-blue-700 border-blue-200',
  Email: 'bg-violet-50 text-violet-700 border-violet-200',
};

export default function CampaignsPage() {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', campaignType: '', targetAudience: '', messageTemplate: '', scheduledAt: '',
  });

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    const res = await getCampaigns();
    if (res.success) setCampaigns(res.data as any[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const handleCreate = async () => {
    if (!form.name || !form.campaignType || !form.messageTemplate) {
      toast.error('Name, type and message template are required');
      return;
    }
    setSaving(true);
    const res = await createCampaign(form);
    setSaving(false);
    if (res.success) {
      toast.success('Campaign created');
      setShowModal(false);
      setForm({ name: '', campaignType: '', targetAudience: '', messageTemplate: '', scheduledAt: '' });
      loadCampaigns();
    } else {
      toast.error('Failed to create campaign');
    }
  };

  const headerActions = (
    <button
      onClick={() => setShowModal(true)}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md"
    >
      <Plus className="h-3.5 w-3.5" /> New Campaign
    </button>
  );

  return (
    <AppShell pageTitle="Campaigns" pageIcon={<Megaphone className="h-5 w-5" />} headerActions={headerActions} onRefresh={loadCampaigns} refreshing={loading}>
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {['Name', 'Type', 'Status', 'Recipients', 'Delivered %', 'Scheduled At', 'Created'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" />
                </td></tr>
              ) : campaigns.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16">
                  <Megaphone className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No campaigns yet</p>
                </td></tr>
              ) : campaigns.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${typeColors[c.campaign_type] || 'bg-gray-100 text-gray-600'}`}>
                      {c.campaign_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusColors[c.status] || 'bg-gray-100 text-gray-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{c.total_recipients}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.total_recipients > 0 ? `${Math.round((c.delivered / c.total_recipients) * 100)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(c.created_at).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">New Campaign</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Campaign Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Monsoon Health Checkup"
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Type *</label>
                  <select
                    value={form.campaignType}
                    onChange={e => setForm(f => ({ ...f, campaignType: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  >
                    <option value="">Select type</option>
                    {CAMPAIGN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Schedule Date</label>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Target Audience</label>
                <input
                  type="text"
                  value={form.targetAudience}
                  onChange={e => setForm(f => ({ ...f, targetAudience: e.target.value }))}
                  placeholder="e.g., Diabetic patients, All patients"
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Message Template *</label>
                <textarea
                  value={form.messageTemplate}
                  onChange={e => setForm(f => ({ ...f, messageTemplate: e.target.value }))}
                  placeholder="Dear {name}, we are pleased to offer..."
                  rows={4}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
