"use client";

import React, { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getERStats } from "@/app/actions/er-actions";

const COLOR_BG: Record<string, string> = {
  Red: "bg-rose-500",
  Orange: "bg-orange-500",
  Yellow: "bg-amber-400",
  Green: "bg-emerald-500",
  Blue: "bg-blue-500",
  Unknown: "bg-gray-400",
};

export default function ERReportsPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await getERStats(days);
    if (res.success) setStats(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [days]);

  const totalTriaged = stats?.triage_breakdown
    ? stats.triage_breakdown.reduce((a: number, b: any) => a + b.count, 0)
    : 0;

  return (
    <AppShell
      pageTitle="ER Reports"
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="Total ER visits" value={stats.total} />
            <Stat label="Triaged" value={totalTriaged} />
            <Stat label="Avg triage TAT (min)" value={stats.avg_triage_tat_mins} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4">Triage Distribution</h3>
              {stats.triage_breakdown?.length === 0 ? (
                <div className="text-xs text-gray-400">No triaged patients.</div>
              ) : (
                <div className="space-y-3">
                  {stats.triage_breakdown.map((t: any) => (
                    <div key={t.triage_level ?? "unknown"}>
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-gray-700">
                          ESI {t.triage_level} · {t.color}
                        </span>
                        <span className="text-gray-500">{t.count}</span>
                      </div>
                      <div className="mt-1 h-2 bg-gray-100 rounded overflow-hidden">
                        <div
                          className={`h-full ${COLOR_BG[t.color] ?? "bg-gray-400"}`}
                          style={{
                            width: `${totalTriaged > 0 ? (t.count / totalTriaged) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4">Disposition Breakdown</h3>
              {stats.disposition_breakdown?.length === 0 ? (
                <div className="text-xs text-gray-400">No closed records.</div>
              ) : (
                <div className="space-y-2">
                  {stats.disposition_breakdown.map((d: any) => (
                    <div key={d.disposition} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-bold">{d.disposition}</span>
                      <span className="font-bold text-gray-800">{d.count}</span>
                    </div>
                  ))}
                </div>
              )}
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
