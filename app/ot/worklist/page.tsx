"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  getOTWorklist,
  recordWheelIn,
  recordWheelOut,
  startSurgery,
  completeSurgery,
} from "@/app/actions/ot-actions";

export default function OTWorklistPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await getOTWorklist(date);
    if (res.success) setSchedules(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [date]);

  const handleAction = async (
    fn: (id: string) => Promise<any>,
    surgeryId: string,
    label: string,
  ) => {
    const res = await fn(surgeryId);
    if (!res.success) alert(res.error || `${label} failed`);
    load();
  };

  return (
    <AppShell
      pageTitle="OT Worklist"
      pageIcon={<ClipboardCheck className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
        />
      }
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl py-16 text-center text-sm text-gray-400">
          No surgeries on {date}.
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s: any) => {
            const r = s.surgery;
            const pac = r?.pac;
            return (
              <div
                key={s.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs px-2 py-0.5 bg-gray-100 rounded">
                      {s.start_time}–{s.end_time}
                    </span>
                    <span className="text-xs font-bold text-gray-700">{s.ot_room?.room_name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        s.status === "Completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : s.status === "InProgress"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-gray-800">{r?.surgery_name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Patient {r?.patient_id} · PAC: {pac?.fitness_status ?? "—"}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1 flex gap-3">
                    <span>Wheel-in: {s.wheel_in_time ? new Date(s.wheel_in_time).toLocaleTimeString() : "—"}</span>
                    <span>Wheel-out: {s.wheel_out_time ? new Date(s.wheel_out_time).toLocaleTimeString() : "—"}</span>
                    <span>Start: {s.actual_start ? new Date(s.actual_start).toLocaleTimeString() : "—"}</span>
                    <span>End: {s.actual_end ? new Date(s.actual_end).toLocaleTimeString() : "—"}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!s.wheel_in_time && (
                    <button
                      onClick={() => handleAction(recordWheelIn, r.id, "Wheel-in")}
                      className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded hover:bg-blue-100"
                    >
                      Wheel-in
                    </button>
                  )}
                  {!s.actual_start && (
                    <button
                      onClick={() => handleAction(startSurgery, r.id, "Start")}
                      className="px-2.5 py-1 bg-amber-50 text-amber-700 text-[11px] font-bold rounded hover:bg-amber-100"
                    >
                      Start
                    </button>
                  )}
                  {s.actual_start && !s.actual_end && (
                    <button
                      onClick={() => handleAction(completeSurgery, r.id, "Complete")}
                      className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded hover:bg-emerald-100"
                    >
                      Complete
                    </button>
                  )}
                  {s.actual_end && !s.wheel_out_time && (
                    <button
                      onClick={() => handleAction(recordWheelOut, r.id, "Wheel-out")}
                      className="px-2.5 py-1 bg-purple-50 text-purple-700 text-[11px] font-bold rounded hover:bg-purple-100"
                    >
                      Wheel-out
                    </button>
                  )}
                  <Link
                    href={`/ot/checklist/${r.id}`}
                    className="px-2.5 py-1 bg-gray-50 text-gray-700 text-[11px] font-bold rounded hover:bg-gray-100"
                  >
                    Checklist
                  </Link>
                  <Link
                    href={`/ot/notes/${r.id}`}
                    className="px-2.5 py-1 bg-gray-50 text-gray-700 text-[11px] font-bold rounded hover:bg-gray-100"
                  >
                    Notes
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
