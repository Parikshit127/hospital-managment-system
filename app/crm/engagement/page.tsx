'use client';

import React, { useState, useEffect } from 'react';
import { HeartHandshake, Loader2, Users, AlertTriangle, Clock, TrendingDown } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getEngagementData } from '@/app/actions/crm-actions';

const riskColors: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  At_Risk: 'bg-amber-50 text-amber-700 border-amber-200',
  Lapsed: 'bg-orange-50 text-orange-700 border-orange-200',
  Lost: 'bg-red-50 text-red-700 border-red-200',
};

export default function CRMEngagementPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    const res = await getEngagementData();
    if (res.success && res.data) {
      setData(res.data);
    } else {
      toast.error('Failed to load engagement data');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const statCards = [
    { label: 'Active', value: data?.active ?? 0, icon: Users, color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    { label: 'At Risk', value: data?.atRisk ?? 0, icon: AlertTriangle, color: 'amber', bg: 'bg-amber-50', text: 'text-amber-700' },
    { label: 'Lapsed', value: data?.lapsed ?? 0, icon: Clock, color: 'orange', bg: 'bg-orange-50', text: 'text-orange-700' },
    { label: 'Lost', value: data?.lost ?? 0, icon: TrendingDown, color: 'red', bg: 'bg-red-50', text: 'text-red-700' },
  ];

  return (
    <AppShell pageTitle="Patient Engagement" pageIcon={<HeartHandshake className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
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

          {/* RFM Explanation Banner */}
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-teal-800">
              <span className="font-black">RFM Scoring: </span>
              Patients are scored by Recency, Frequency, and Monetary value. At Risk = no visit in 60+ days. Lapsed = 90+ days. Lost = 180+ days.
            </p>
          </div>

          {/* At Risk & Lapsed Patients Table */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">At Risk &amp; Lapsed Patients</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Patient ID', 'Risk Level', 'Last Visit', 'Visit Count', 'Total Revenue', 'Engagement Score', 'Next Follow-up', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(!data?.atRiskPatients || data.atRiskPatients.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400 text-xs">No at-risk or lapsed patients</td>
                    </tr>
                  ) : data.atRiskPatients.map((p: any) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.patient_id || p.id?.slice(0, 8)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${riskColors[p.risk_level] || 'bg-gray-100 text-gray-600'}`}>
                          {p.risk_level?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {p.last_visit ? new Date(p.last_visit).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs font-semibold">{p.visit_count ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs font-semibold">
                        {p.total_revenue != null ? `₹${Number(p.total_revenue).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs font-semibold">{p.engagement_score ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {p.next_followup ? new Date(p.next_followup).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-xs font-bold text-orange-600 hover:text-orange-700 border border-orange-200 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg transition-colors">
                          Schedule Follow-up
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
