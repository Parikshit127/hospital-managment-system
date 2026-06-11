'use client';

import React, { useState, useEffect } from 'react';
import { Star, Loader2, MessageSquare } from 'lucide-react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { getFeedbackAnalysis } from '@/app/actions/crm-actions';

const ratingBarColor: Record<number, string> = {
  5: 'bg-emerald-500',
  4: 'bg-orange-500',
  3: 'bg-amber-500',
  2: 'bg-orange-500',
  1: 'bg-red-500',
};

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`}
        />
      ))}
    </span>
  );
}

function rowBg(rating: number): string {
  if (rating === 5) return 'bg-emerald-50';
  if (rating <= 2) return 'bg-red-50';
  return 'bg-white';
}

export default function CRMFeedbackPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    const res = await getFeedbackAnalysis();
    if (res.success && res.data) {
      setData(res.data);
    } else {
      toast.error('Failed to load feedback data');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const fiveStar = data?.byRating?.find((r: any) => r.rating === 5)?.count ?? 0;
  const oneStar = data?.byRating?.find((r: any) => r.rating === 1)?.count ?? 0;
  const total = data?.total ?? 0;

  const statCards = [
    { label: 'Total Feedback', value: total },
    { label: 'Avg Rating', value: data?.avgRating ?? '0', isRating: true },
    { label: '5-Star Reviews', value: fiveStar },
    { label: '1-Star Reviews', value: oneStar },
  ];

  return (
    <AppShell pageTitle="Feedback Analysis" pageIcon={<Star className="h-5 w-5" />} onRefresh={loadData} refreshing={loading}>
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
                  <Star className="h-4 w-4 text-gray-300" />
                </div>
                {s.isRating ? (
                  <div className="flex items-end gap-1">
                    <p className="text-2xl font-black text-gray-900">{s.value}</p>
                    <span className="text-xs text-gray-400 mb-0.5">/ 5</span>
                  </div>
                ) : (
                  <p className="text-2xl font-black text-gray-900">{s.value}</p>
                )}
              </div>
            ))}
          </div>

          {/* Rating Distribution */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Rating Distribution</h3>
            <div className="space-y-3">
              {(data?.byRating ?? []).map((r: any) => {
                const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                return (
                  <div key={r.rating} className="flex items-center gap-3">
                    <span className="w-14 text-xs font-semibold text-gray-600 shrink-0 flex items-center gap-1">
                      {r.rating} <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${ratingBarColor[r.rating] || 'bg-gray-400'}`}
                        style={{ width: `${Math.max(pct, r.count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className="w-16 text-xs font-bold text-gray-500 text-right">{r.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Feedback Table */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-bold text-gray-900">Recent Feedback</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Date', 'Patient ID', 'Rating', 'Comments', 'Department'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(!data?.feedbacks || data.feedbacks.length === 0) ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-gray-400 text-xs">No feedback yet</td>
                    </tr>
                  ) : data.feedbacks.map((f: any) => {
                    const rating = Number(f.rating) || 0;
                    return (
                      <tr key={f.id} className={`hover:brightness-95 transition-all ${rowBg(rating)}`}>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {f.created_at ? new Date(f.created_at).toLocaleDateString('en-GB') : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {f.patient_id || f.id?.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3">
                          <StarDisplay rating={rating} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-xs">
                          {f.comments ? (f.comments.length > 80 ? f.comments.slice(0, 80) + '…' : f.comments) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{f.department || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
