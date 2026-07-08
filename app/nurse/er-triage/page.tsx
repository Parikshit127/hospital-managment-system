"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Siren, Loader2, Activity, AlertTriangle } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getERDashboard } from "@/app/actions/er-actions";

const TRIAGE_COLORS: Record<string, string> = {
  Red: "bg-rose-100 text-rose-700 border-rose-200",
  Orange: "bg-orange-100 text-orange-700 border-orange-200",
  Yellow: "bg-amber-100 text-amber-700 border-amber-200",
  Green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Blue: "bg-blue-100 text-blue-700 border-blue-200",
};

export default function NurseERTriageDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await getERDashboard();
    if (res.success) setData(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <AppShell
      pageTitle="ER Triage Dashboard"
      pageIcon={<Siren className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      {loading && !data ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Welcome/Summary Banner */}
          <div className="bg-gradient-to-r from-rose-500 to-rose-600 rounded-2xl p-6 text-white shadow-lg shadow-rose-500/20">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-[0.15em] text-white/70 mb-1">Nursing Operations</p>
              <h2 className="text-2xl font-black">Emergency Room Triage</h2>
              <p className="text-sm text-white/90 mt-1">
                Monitor and prioritize incoming ER patients using the Emergency Severity Index (ESI).
              </p>
            </div>
          </div>

          {/* Triage Level Distribution */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(["1", "2", "3", "4", "5"] as const).map((lvl) => {
              const color = ["Red", "Orange", "Yellow", "Green", "Blue"][Number(lvl) - 1];
              return (
                <div
                  key={lvl}
                  className={`border-2 rounded-xl p-4 transition-all duration-200 hover:shadow-sm ${TRIAGE_COLORS[color]}`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider">
                    ESI {lvl} · {color}
                  </div>
                  <div className="mt-2 text-3xl font-black">
                    {data?.by_triage_level?.[lvl] ?? 0}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Key Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KPI icon={<Activity className="h-4 w-4 text-blue-500" />} label="Active ER Patients" value={data?.active?.length ?? 0} />
            <KPI label="Arrived Today" value={data?.today_count ?? 0} />
            <KPI
              icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
              label="Medico-Legal Cases (MLC)"
              value={data?.today_mlc_count ?? 0}
            />
          </div>

          {/* Patients Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">
                Active Patients Worklist
              </span>
              <span className="text-xs text-gray-500 font-medium">
                Auto-refreshes every 30s
              </span>
            </div>
            {data?.active?.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">No active ER patients.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3">ER #</th>
                    <th className="text-left px-5 py-3">Patient Name</th>
                    <th className="text-left px-5 py-3">Triage Level</th>
                    <th className="text-left px-5 py-3">Chief Complaint</th>
                    <th className="text-left px-5 py-3">Arrival Time</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-right px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.active?.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-gray-600">{r.er_number}</td>
                      <td className="px-5 py-3">
                        <div className="font-bold text-gray-800">{r.patient_name}</div>
                        <div className="flex gap-1.5 mt-0.5">
                          {r.is_unknown && (
                            <span className="px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-bold">
                              UNKNOWN
                            </span>
                          )}
                          {r.is_mlc && (
                            <span className="px-1.5 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-bold">
                              MLC
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {r.triage_color ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${TRIAGE_COLORS[r.triage_color]}`}
                          >
                            ESI {r.triage_level} · {r.triage_color}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 border border-gray-200">
                            Not Triaged
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-600">{r.chief_complaint}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {new Date(r.arrival_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-5 py-3 text-xs">
                        <span className={`font-semibold ${r.status === 'Triaged' ? 'text-blue-600' : 'text-gray-700'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/nurse/er-triage/${r.id}`}
                          className="text-xs font-bold text-rose-600 hover:text-rose-700 transition-colors inline-flex items-center gap-0.5"
                        >
                          {r.triage_level ? "Re-triage →" : "Triage now →"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function KPI({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-black text-gray-800">{value}</div>
    </div>
  );
}
