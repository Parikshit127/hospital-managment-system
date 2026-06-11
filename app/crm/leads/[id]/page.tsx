'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, Phone, Mail, Building2, FileText, Loader2, X, Check, AlertCircle, MessageSquare, ArrowLeft } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getLeadDetail, addLeadActivity, updateLeadStatus } from '@/app/actions/crm-actions';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const STATUSES = ['New', 'Contacted', 'Interested', 'Appointment_Booked', 'Converted', 'Lost'];
const ACTIVITY_TYPES = ['Call', 'WhatsApp', 'Email', 'SMS', 'Note'];
const DIRECTIONS = ['Inbound', 'Outbound'];
const OUTCOMES = ['Connected', 'No Answer', 'Interested', 'Not Interested', 'Callback'];

const statusColors: Record<string, string> = {
  New: 'bg-blue-50 text-blue-700 border-blue-200',
  Contacted: 'bg-violet-50 text-violet-700 border-violet-200',
  Interested: 'bg-amber-50 text-amber-700 border-amber-200',
  Appointment_Booked: 'bg-orange-50 text-orange-700 border-orange-200',
  Converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Lost: 'bg-red-50 text-red-700 border-red-200',
};

const activityIcon = (type: string) => {
  switch (type) {
    case 'Call': return <Phone className="h-3.5 w-3.5" />;
    case 'WhatsApp': return <MessageSquare className="h-3.5 w-3.5" />;
    case 'Email': return <Mail className="h-3.5 w-3.5" />;
    case 'SMS': return <MessageSquare className="h-3.5 w-3.5" />;
    default: return <FileText className="h-3.5 w-3.5" />;
  }
};

const activityIconColor: Record<string, string> = {
  Call: 'bg-blue-50 text-blue-600',
  WhatsApp: 'bg-green-50 text-green-600',
  Email: 'bg-violet-50 text-violet-600',
  SMS: 'bg-amber-50 text-amber-600',
  Note: 'bg-gray-100 text-gray-600',
};

export default function LeadDetailPage() {
  const toast = useToast();
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [lostReason, setLostReason] = useState('');

  const [activityForm, setActivityForm] = useState({
    activityType: 'Call', direction: 'Outbound', content: '', outcome: '', performedBy: 'Reception',
  });

  const loadLead = useCallback(async () => {
    setLoading(true);
    const res = await getLeadDetail(leadId);
    if (res.success && res.data) {
      setLead(res.data);
    } else {
      toast.error('Failed to load lead');
    }
    setLoading(false);
  }, [leadId]);

  useEffect(() => { loadLead(); }, [loadLead]);

  const handleAddActivity = async () => {
    if (!activityForm.content) {
      toast.error('Activity content is required');
      return;
    }
    setSavingActivity(true);
    const res = await addLeadActivity({ leadId, ...activityForm });
    setSavingActivity(false);
    if (res.success) {
      toast.success('Activity logged');
      setShowActivityModal(false);
      setActivityForm({ activityType: 'Call', direction: 'Outbound', content: '', outcome: '', performedBy: 'Reception' });
      loadLead();
    } else {
      toast.error('Failed to log activity');
    }
  };

  const handleMarkLost = async () => {
    setUpdatingStatus(true);
    const res = await updateLeadStatus(leadId, 'Lost', lostReason);
    setUpdatingStatus(false);
    if (res.success) {
      toast.success('Lead marked as lost');
      setShowLostModal(false);
      setLostReason('');
      loadLead();
    } else {
      toast.error('Failed to update status');
    }
  };

  const handleStatusAdvance = async (status: string) => {
    setUpdatingStatus(true);
    const res = await updateLeadStatus(leadId, status);
    setUpdatingStatus(false);
    if (res.success) {
      toast.success('Status updated');
      loadLead();
    } else {
      toast.error('Failed to update status');
    }
  };

  const currentStageIndex = lead ? STATUSES.filter(s => s !== 'Lost').indexOf(lead.status) : -1;
  const funnelStages = STATUSES.filter(s => s !== 'Lost');

  const headerActions = (
    <div className="flex items-center gap-2">
      <Link href="/crm/leads" className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Leads
      </Link>
      <button
        onClick={() => setShowActivityModal(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md"
      >
        <Phone className="h-3.5 w-3.5" /> Add Activity
      </button>
    </div>
  );

  if (loading) {
    return (
      <AppShell pageTitle="Lead Detail" pageIcon={<Users className="h-5 w-5" />}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell pageTitle="Lead Not Found" pageIcon={<Users className="h-5 w-5" />}>
        <div className="text-center py-24 text-gray-400">Lead not found</div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle={lead.name} pageIcon={<Users className="h-5 w-5" />} headerActions={headerActions} onRefresh={loadLead} refreshing={loading}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Lead Info */}
        <div className="space-y-4">
          {/* Info Card */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                {lead.lead_number}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusColors[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                {lead.status.replace('_', ' ')}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Name</p>
                  <p className="text-sm font-bold text-gray-900">{lead.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Phone className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Phone</p>
                  <p className="text-sm font-bold text-gray-900 font-mono">{lead.phone}</p>
                </div>
              </div>
              {lead.email && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Email</p>
                    <p className="text-sm font-medium text-gray-900">{lead.email}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Source</p>
                  <p className="text-sm font-medium text-gray-900">{lead.source}</p>
                </div>
              </div>
              {lead.department_interest && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Department Interest</p>
                    <p className="text-sm font-medium text-gray-900">{lead.department_interest}</p>
                  </div>
                </div>
              )}
              {lead.notes && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Notes</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{lead.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Status Progress */}
          {lead.status !== 'Lost' && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Pipeline Progress</h3>
              <div className="space-y-2">
                {funnelStages.map((stage, idx) => {
                  const isCompleted = idx < currentStageIndex;
                  const isCurrent = idx === currentStageIndex;
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${isCompleted ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {isCompleted ? <Check className="h-3 w-3" /> : idx + 1}
                      </div>
                      <span className={`text-xs font-medium ${isCurrent ? 'text-orange-700 font-bold' : isCompleted ? 'text-emerald-700' : 'text-gray-400'}`}>
                        {stage.replace('_', ' ')}
                      </span>
                      {isCurrent && idx < funnelStages.length - 1 && (
                        <button
                          onClick={() => handleStatusAdvance(funnelStages[idx + 1])}
                          disabled={updatingStatus}
                          className="ml-auto text-[10px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200"
                        >
                          Advance
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {lead.status !== 'Converted' && lead.status !== 'Lost' && (
                <button
                  onClick={() => setShowLostModal(true)}
                  className="mt-4 w-full py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 transition-colors"
                >
                  Mark as Lost
                </button>
              )}
            </div>
          )}

          {lead.status === 'Lost' && lead.lost_reason && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-red-700 mb-1">Lost Reason</p>
              <p className="text-xs text-red-600">{lead.lost_reason}</p>
            </div>
          )}
        </div>

        {/* Right: Activity Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Activity Timeline</h3>
              <span className="text-xs text-gray-400">{lead.activities?.length || 0} activities</span>
            </div>

            {(!lead.activities || lead.activities.length === 0) ? (
              <div className="text-center py-12">
                <MessageSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No activities yet</p>
                <button
                  onClick={() => setShowActivityModal(true)}
                  className="mt-3 text-xs font-bold text-orange-600 hover:text-orange-700"
                >
                  Log first activity
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {lead.activities.map((act: any, idx: number) => (
                  <div key={act.id} className="flex gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${activityIconColor[act.activity_type] || 'bg-gray-100 text-gray-600'}`}>
                      {activityIcon(act.activity_type)}
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-800">{act.activity_type}</span>
                          {act.direction && (
                            <span className="text-[10px] text-gray-400">({act.direction})</span>
                          )}
                          {act.outcome && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                              {act.outcome}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {new Date(act.performed_at).toLocaleDateString('en-GB', { day: 'numeric', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed">{act.content}</p>
                      <p className="text-[10px] text-gray-400 mt-1">by {act.performed_by}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Activity Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowActivityModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Log Activity</h2>
              <button onClick={() => setShowActivityModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Activity Type</label>
                  <select
                    value={activityForm.activityType}
                    onChange={e => setActivityForm(f => ({ ...f, activityType: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  >
                    {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Direction</label>
                  <select
                    value={activityForm.direction}
                    onChange={e => setActivityForm(f => ({ ...f, direction: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  >
                    {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Content *</label>
                <textarea
                  value={activityForm.content}
                  onChange={e => setActivityForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Describe what happened..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Outcome</label>
                  <select
                    value={activityForm.outcome}
                    onChange={e => setActivityForm(f => ({ ...f, outcome: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  >
                    <option value="">Select outcome</option>
                    {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Performed By</label>
                  <input
                    type="text"
                    value={activityForm.performedBy}
                    onChange={e => setActivityForm(f => ({ ...f, performedBy: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <button
                onClick={handleAddActivity}
                disabled={savingActivity}
                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingActivity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Log Activity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Lost Modal */}
      {showLostModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLostModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-50 rounded-xl"><AlertCircle className="h-5 w-5 text-red-500" /></div>
                <h2 className="text-base font-bold text-gray-900">Mark as Lost</h2>
              </div>
              <textarea
                value={lostReason}
                onChange={e => setLostReason(e.target.value)}
                placeholder="Reason for losing this lead..."
                rows={3}
                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-red-500 resize-none"
              />
              <div className="flex items-center gap-2">
                <button onClick={() => setShowLostModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl">
                  Cancel
                </button>
                <button
                  onClick={handleMarkLost}
                  disabled={updatingStatus}
                  className="flex-1 py-2 bg-red-500 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {updatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Mark Lost
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
