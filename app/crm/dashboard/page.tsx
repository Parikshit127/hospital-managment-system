'use client';

import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, TrendingUp, Megaphone, ArrowRight, Loader2, Phone, Globe, Share2, UserCheck, Building2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getCRMDashboard } from '@/app/actions/crm-actions';
import Link from 'next/link';

const statusColors: Record<string, string> = {
  New: 'bg-blue-50 text-blue-700 border-blue-200',
  Contacted: 'bg-violet-50 text-violet-700 border-violet-200',
  Interested: 'bg-amber-50 text-amber-700 border-amber-200',
  Appointment_Booked: 'bg-teal-50 text-teal-700 border-teal-200',
  Converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Lost: 'bg-red-50 text-red-700 border-red-200',
};

const campaignStatusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600 border-gray-200',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  Running: 'bg-amber-50 text-amber-700 border-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const FUNNEL_STAGES = ['New', 'Contacted', 'Interested', 'Appointment_Booked', 'Converted'];

export default function CRMDashboardPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    const res = await getCRMDashboard();
    if (res.success && res.data) {
      setData(res.data);
    } else {
      toast.error('Failed to load CRM dashboard');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Compute source breakdown from recentLeads
  const sourceBreakdown = React.useMemo(() => {
    if (!data?.recentLeads) return [];
    const map: Record<string, { count: number; converted: number }> = {};
    data.recentLeads.forEach((l: any) => {
      if (!map[l.source]) map[l.source] = { count: 0, converted: 0 };
      map[l.source].count++;
      if (l.status === 'Converted') map[l.source].converted++;
    });
    return Object.entries(map).map(([source, v]) => ({
      source,
      count: v.count,
      convRate: v.count > 0 ? Math.round((v.converted / v.count) * 100) : 0,
    })).sort((a, b) => b.count - a.count);
  }, [data]);

  // Funnel stage counts from recentLeads (approximation from dashboard data)
  const funnelCounts = React.useMemo(() => {
    if (!data?.recentLeads) return {};
    const map: Record<string, number> = {};
    data.recentLeads.forEach((l: any) => {
      map[l.status] = (map[l.status] || 0) + 1;
    });
    return map;
  }, [data]);

  const maxFunnelCount = Math.max(1, ...FUNNEL_STAGES.map(s => funnelCounts[s] || 0));

  const statCards = [
    { label: 'Total Leads', value: data?.totalLeads ?? 0, icon: Users, color: 'teal' },
    { label: 'Conversion Rate', value: `${data?.conversionRate ?? 0}%`, icon: TrendingUp, color: 'emerald' },
    { label: 'New This Week', value: data?.newLeads ?? 0, icon: UserCheck, color: 'blue' },
    { label: 'Active Campaigns', value: data?.campaigns?.length ?? 0, icon: Megaphone, color: 'violet' },
  ];

  const sourceIcon = (source: string) => {
    if (source === 'Website') return <Globe className="h-3.5 w-3.5" />;
    if (source === 'Social Media') return <Share2 className="h-3.5 w-3.5" />;
    if (source === 'Doctor Referral') return <UserCheck className="h-3.5 w-3.5" />;
    if (source === 'Walk-in') return <Building2 className="h-3.5 w-3.5" />;
    return <Phone className="h-3.5 w-3.5" />;
  };

  return (
    <AppShell pageTitle="CRM Dashboard" pageIcon={<LayoutDashboard className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((s) => (
              <div key={s.label} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{s.label}</span>
                  <s.icon className="h-4 w-4 text-gray-300" />
                </div>
                <p className="text-2xl font-black text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lead Status Funnel */}
            <div className="lg:col-span-2 bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Lead Pipeline Funnel</h3>
              <div className="space-y-3">
                {FUNNEL_STAGES.map((stage) => {
                  const count = funnelCounts[stage] || 0;
                  const pct = Math.round((count / maxFunnelCount) * 100);
                  const stageLabel = stage.replace('_', ' ');
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className="w-32 text-xs font-semibold text-gray-600 shrink-0">{stageLabel}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center pl-3 text-[10px] font-bold text-white mix-blend-overlay">
                          {count}
                        </span>
                      </div>
                      <span className="w-8 text-xs font-bold text-gray-500 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Source Breakdown */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Lead Sources</h3>
              {sourceBreakdown.length === 0 ? (
                <p className="text-gray-400 text-xs text-center py-8">No data yet</p>
              ) : (
                <div className="space-y-2">
                  {sourceBreakdown.map((s) => (
                    <div key={s.source} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-teal-500">{sourceIcon(s.source)}</span>
                        <span className="text-xs font-medium text-gray-700">{s.source}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-900">{s.count}</span>
                        <span className="text-[10px] text-emerald-600 font-semibold">{s.convRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Leads */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Recent Leads</h3>
              <Link href="/crm/leads" className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Name', 'Phone', 'Source', 'Status', 'Last Contact', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(!data?.recentLeads || data.recentLeads.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-400 text-xs">No leads yet</td>
                    </tr>
                  ) : data.recentLeads.map((lead: any) => (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{lead.name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono">{lead.phone}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{lead.source}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusColors[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                          {lead.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {lead.last_contacted ? new Date(lead.last_contacted).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/crm/leads/${lead.id}`} className="text-xs font-bold text-teal-600 hover:text-teal-700">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Campaigns */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Recent Campaigns</h3>
              <Link href="/crm/campaigns" className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {(!data?.campaigns || data.campaigns.length === 0) ? (
              <p className="text-gray-400 text-xs text-center py-6">No campaigns yet</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.campaigns.map((c: any) => (
                  <div key={c.id} className="border border-gray-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-800 truncate">{c.name}</span>
                      <span className={`ml-2 shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${campaignStatusColors[c.status] || 'bg-gray-100 text-gray-600'}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-medium">{c.campaign_type} • {c.total_recipients} recipients</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
