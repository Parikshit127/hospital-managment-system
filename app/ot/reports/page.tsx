"use client";

import React, { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getOTStats, listSurgeryRequests } from "@/app/actions/ot-actions";

export default function OTReportsPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, r] = await Promise.all([getOTStats(days), listSurgeryRequests()]);
    if (s.success) setStats(s.data);
    if (r.success) setRequests(r.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [days]);

  // Aggregate by category
  const byCategory: Record<string, number> = {};
  for (const r of requests) {
    const k = r.surgery_category || "Uncategorized";
    byCategory[k] = (byCategory[k] || 0) + 1;
  }
  const byUrgency: Record<string, number> = { Elective: 0, Urgent: 0, Emergency: 0 };
  for (const r of requests) {
    byUrgency[r.urgency] = (byUrgency[r.urgency] || 0) + 1;
  }

  return (
    <AppShell
      pageTitle="OT Reports"
      pageIcon={<BarChart3 className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      }
    >
      {loading || !stats ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total Requests" value={stats.total_requests} />
            <Stat label="Completed" value={stats.completed} />
            <Stat label="Cancelled" value={stats.cancelled} />
            <Stat label="Cancellation Rate" value={`${stats.cancellation_rate}%`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Avg Duration (min)" value={stats.avg_duration_mins} />
            <Stat label="Active OT Rooms" value={stats.active_rooms} />
            <Stat label="Elective" value={byUrgency.Elective} />
            <Stat label="Emergency" value={byUrgency.Emergency} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">By Category</h3>
              {Object.entries(byCategory).length === 0 ? (
                <div className="text-xs text-gray-400">No data</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(byCategory).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{k}</span>
                      <span className="font-bold text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">By Urgency</h3>
              <div className="space-y-2">
                {Object.entries(byUrgency).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{k}</span>
                    <span className="font-bold text-gray-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-gray-800">{value}</div>
    </div>
  );
}
