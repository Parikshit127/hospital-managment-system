'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getCRMReports } from '@/app/actions/crm-actions';

export default function CRMReportsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const res = await getCRMReports();
    if (res.success && res.data) {
      setData(res.data);
    } else {
      toast.error('Failed to load CRM reports');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  if (loading) {
    return (
      <AppShell pageTitle="CRM Reports" pageIcon={<BarChart3 className="h-5 w-5" />} onRefresh={loadReports} refreshing={loading}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      </AppShell>
    );
  }

  const bySource: { source: string; _count: { id: number } }[] = data?.bySource || [];
  const byStatus: { status: string; _count: { id: number } }[] = data?.byStatus || [];
  const campaigns: any[] = data?.campaigns || [];
  const referrals: any[] = data?.referrals || [];

  return (
    <AppShell pageTitle="CRM Reports" pageIcon={<BarChart3 className="h-5 w-5" />} onRefresh={loadReports} refreshing={loading}>
      <div className="space-y-6">

        {/* Leads by Source */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Leads by Source</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Source', 'Count'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bySource.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="text-center py-8 text-gray-400 text-xs">No data available</td>
                  </tr>
                ) : bySource.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.source}</td>
                    <td className="px-4 py-3 text-gray-700 font-semibold">{row._count?.id ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lead Status Breakdown */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Leads by Status</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Status', 'Count'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byStatus.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="text-center py-8 text-gray-400 text-xs">No data available</td>
                  </tr>
                ) : byStatus.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.status.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-gray-700 font-semibold">{row._count?.id ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Campaign Performance */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Campaign Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Campaign', 'Type', 'Status', 'Recipients', 'Delivered'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-400 text-xs">No campaigns yet</td>
                  </tr>
                ) : campaigns.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.campaign_type}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.status}</td>
                    <td className="px-4 py-3 text-gray-700">{c.total_recipients ?? 0}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.total_recipients > 0
                        ? `${Math.round(((c.delivered ?? 0) / c.total_recipients) * 100)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Referrers */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Top Referrers</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Doctor', 'Specialty', 'Referrals', 'Conversions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {referrals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400 text-xs">No referral data yet</td>
                  </tr>
                ) : referrals.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.doctor_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.specialty || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 font-semibold">{r.referral_count ?? 0}</td>
                    <td className="px-4 py-3 text-gray-700">{r.converted_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
