"use client";

import React, { useEffect, useState } from "react";
import { MonitorPlay, Loader2 } from "lucide-react";
import { getERTrackingBoard } from "@/app/actions/er-actions";

// Full-screen wall display — minimal chrome, large fonts, auto-refresh.

const TRIAGE_BG: Record<string, string> = {
  Red: "bg-rose-500 text-white",
  Orange: "bg-orange-500 text-white",
  Yellow: "bg-amber-400 text-gray-900",
  Green: "bg-emerald-500 text-white",
  Blue: "bg-blue-500 text-white",
};

export default function ERTrackingBoard() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const load = async () => {
    const res = await getERTrackingBoard();
    if (res.success) setList(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(new Date()), 1000);
    const refresh = setInterval(load, 15_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <MonitorPlay className="h-7 w-7" />
          <h1 className="text-3xl font-black tracking-tight">ER Tracking Board</h1>
        </div>
        <div className="text-right">
          <div className="text-4xl font-black font-mono">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">
            {list.length} active · auto-refresh 15s
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-32 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((r: any) => {
            const wait = Math.floor((now.getTime() - new Date(r.arrival_time).getTime()) / 60000);
            return (
              <div
                key={r.id}
                className={`rounded-xl p-5 shadow-lg ${TRIAGE_BG[r.triage_color] ?? "bg-gray-700"}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold opacity-80 tracking-wider">{r.er_number}</div>
                    <div className="text-2xl font-black mt-1">{r.patient_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold opacity-80">ESI {r.triage_level ?? "?"}</div>
                    <div className="text-xs font-bold opacity-80">{r.status}</div>
                  </div>
                </div>
                <div className="mt-3 text-sm opacity-90 line-clamp-2">{r.chief_complaint}</div>
                <div className="mt-3 flex items-center justify-between text-xs font-bold opacity-90">
                  <span>Arrived {new Date(r.arrival_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>{wait} min wait</span>
                </div>
                {r.is_mlc && (
                  <div className="mt-2 inline-block px-2 py-0.5 rounded bg-black/30 text-xs font-bold">
                    MLC
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
