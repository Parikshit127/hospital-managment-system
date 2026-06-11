'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Loader2, X, Check, ChevronDown } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getLeads, createLead, updateLeadStatus } from '@/app/actions/crm-actions';
import Link from 'next/link';

const STATUSES = ['New', 'Contacted', 'Interested', 'Appointment_Booked', 'Converted', 'Lost'];
const SOURCES = ['Website', 'Social Media', 'Referral', 'Walk-in', 'Campaign', 'Doctor Referral'];

const statusColors: Record<string, string> = {
  New: 'bg-blue-50 text-blue-700 border-blue-200',
  Contacted: 'bg-violet-50 text-violet-700 border-violet-200',
  Interested: 'bg-amber-50 text-amber-700 border-amber-200',
  Appointment_Booked: 'bg-orange-50 text-orange-700 border-orange-200',
  Converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Lost: 'bg-red-50 text-red-700 border-red-200',
};

export default function LeadsPage() {
  const toast = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', phone: '', email: '', source: '', sourceDetail: '',
    departmentInterest: '', notes: '',
  });

  const loadLeads = useCallback(async () => {
    setLoading(true);
    const res = await getLeads({
      status: filterStatus || undefined,
      source: filterSource || undefined,
    });
    if (res.success) setLeads(res.data as any[]);
    setLoading(false);
  }, [filterStatus, filterSource]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filtered = leads.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search)
  );

  const handleCreate = async () => {
    if (!form.name || !form.phone || !form.source) {
      toast.error('Name, phone and source are required');
      return;
    }
    setSaving(true);
    const res = await createLead(form);
    setSaving(false);
    if (res.success) {
      toast.success('Lead created successfully');
      setShowAddModal(false);
      setForm({ name: '', phone: '', email: '', source: '', sourceDetail: '', departmentInterest: '', notes: '' });
      loadLeads();
    } else {
      toast.error('Failed to create lead');
    }
  };

  const handleStatusUpdate = async (leadId: string, status: string) => {
    setUpdatingId(leadId);
    const res = await updateLeadStatus(leadId, status);
    setUpdatingId(null);
    if (res.success) {
      toast.success('Status updated');
      loadLeads();
    } else {
      toast.error('Failed to update status');
    }
  };

  const headerActions = (
    <button
      onClick={() => setShowAddModal(true)}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md"
    >
      <Plus className="h-3.5 w-3.5" /> Add Lead
    </button>
  );

  return (
    <AppShell pageTitle="Lead Management" pageIcon={<Users className="h-5 w-5" />} headerActions={headerActions} onRefresh={loadLeads} refreshing={loading}>
      <div className="space-y-5">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or phone..."
              className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 w-56"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">All Sources</option>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Lead #', 'Name', 'Phone', 'Source', 'Status', 'Assigned To', 'Last Contacted', 'Follow-up', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto" />
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-16">
                    <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No leads found</p>
                  </td></tr>
                ) : filtered.map((lead: any) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono font-bold text-orange-600">{lead.lead_number}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{lead.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs font-mono">{lead.phone}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{lead.source}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusColors[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                        {lead.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{lead.assigned_to || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {lead.last_contacted ? new Date(lead.last_contacted).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {lead.follow_up_date ? new Date(lead.follow_up_date).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/crm/leads/${lead.id}`} className="text-xs font-bold text-orange-600 hover:text-orange-700 whitespace-nowrap">
                          View
                        </Link>
                        <div className="relative group">
                          <button className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg">
                            Status <ChevronDown className="h-3 w-3" />
                          </button>
                          <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-10 hidden group-hover:block">
                            {STATUSES.filter(s => s !== lead.status).map(s => (
                              <button
                                key={s}
                                onClick={() => handleStatusUpdate(lead.id, s)}
                                disabled={updatingId === lead.id}
                                className="w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                              >
                                {s.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Add New Lead</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Patient name"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Phone *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="Mobile number"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Source *</label>
                  <select
                    value={form.source}
                    onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  >
                    <option value="">Select source</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Department Interest</label>
                  <input
                    type="text"
                    value={form.departmentInterest}
                    onChange={e => setForm(f => ({ ...f, departmentInterest: e.target.value }))}
                    placeholder="e.g., Cardiology"
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Create Lead
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
