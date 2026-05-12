"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Siren, Loader2, UserPlus, Activity, AlertTriangle, MonitorPlay } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getERDashboard } from "@/app/actions/er-actions";

const TRIAGE_COLORS: Record<string, string> = {
  Red: "bg-rose-100 text-rose-700 border-rose-200",
  Orange: "bg-orange-100 text-orange-700 border-orange-200",
  Yellow: "bg-amber-100 text-amber-700 border-amber-200",
  Green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Blue: "bg-blue-100 text-blue-700 border-blue-200",
};

export default function ERDashboardPage() {
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
      pageTitle="Emergency Room"
      pageIcon={<Siren className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <div className="flex items-center gap-2">
          <Link
            href="/er/register"
            className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 flex items-center gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" /> Register
          </Link>
          <Link
            href="/er/tracking-board"
            className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
          >
            <MonitorPlay className="h-3.5 w-3.5" /> Tracking Board
          </Link>
        </div>
      }
    >
      {loading && !data ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(["1", "2", "3", "4", "5"] as const).map((lvl) => {
              const color = ["Red", "Orange", "Yellow", "Green", "Blue"][Number(lvl) - 1];
              return (
                <div
                  key={lvl}
                  className={`border-2 rounded-xl p-4 ${TRIAGE_COLORS[color]}`}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KPI icon={<Activity className="h-4 w-4 text-blue-500" />} label="Active patients" value={data?.active?.length ?? 0} />
            <KPI label="Today total" value={data?.today_count ?? 0} />
            <KPI
              icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
              label="MLC today"
              value={data?.today_mlc_count ?? 0}
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 text-sm font-bold text-gray-700">
              Active ER Patients
            </div>
            {data?.active?.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">No active patients.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                  <tr>
                    <th className="text-left px-4 py-2">ER #</th>
                    <th className="text-left px-4 py-2">Patient</th>
                    <th className="text-left px-4 py-2">Triage</th>
                    <th className="text-left px-4 py-2">Complaint</th>
                    <th className="text-left px-4 py-2">Arrived</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-right px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data?.active?.map((r: any) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-mono text-xs">{r.er_number}</td>
                      <td className="px-4 py-2">
                        <div className="font-bold">{r.patient_name}</div>
                        {r.is_unknown && (
                          <div className="text-[10px] text-amber-600 font-bold">UNKNOWN</div>
                        )}
                        {r.is_mlc && (
                          <div className="text-[10px] text-rose-600 font-bold">MLC</div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {r.triage_color ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${TRIAGE_COLORS[r.triage_color]}`}
                          >
                            ESI {r.triage_level} · {r.triage_color}
                          </span>
                        ) : (
                          <Link
                            href={`/er/triage/${r.id}`}
                            className="text-[11px] font-bold text-blue-600 hover:underline"
                          >
                            Triage now →
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{r.chief_complaint}</td>
                      <td className="px-4 py-2 text-xs">
                        {new Date(r.arrival_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2 text-xs font-bold">{r.status}</td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/er/patient/${r.id}`}
                          className="text-xs font-bold text-blue-600 hover:underline"
                        >
                          Open →
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
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-black text-gray-800">{value}</div>
    </div>
  );
}
