"use client";

import React, { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getOTCalendar } from "@/app/actions/ot-actions";

export default function OTCalendarPage() {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [rooms, setRooms] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await getOTCalendar(start.toISOString());
    if (res.success) {
      setRooms(res.data.rooms);
      setSchedules(res.data.schedules);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [start]);

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  const cellSchedules = (roomId: string, day: Date) =>
    schedules.filter(
      (s) =>
        s.ot_room_id === roomId &&
        new Date(s.scheduled_date).toDateString() === day.toDateString(),
    );

  return (
    <AppShell
      pageTitle="OT Calendar"
      pageIcon={<CalendarDays className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const d = new Date(start);
              d.setDate(d.getDate() - 7);
              setStart(d);
            }}
            className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-bold text-gray-700 px-3">
            {days[0].toLocaleDateString()} – {days[6].toLocaleDateString()}
          </div>
          <button
            onClick={() => {
              const d = new Date(start);
              d.setDate(d.getDate() + 7);
              setStart(d);
            }}
            className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            setStart(d);
          }}
          className="text-xs font-bold text-blue-600 hover:underline"
        >
          Today
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-3 py-2 font-bold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                  Room
                </th>
                {days.map((d) => (
                  <th
                    key={d.toISOString()}
                    className="text-left px-3 py-2 font-bold text-gray-500 uppercase tracking-wider"
                  >
                    {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">
                    No active OT rooms. Configure in OT Master Setup.
                  </td>
                </tr>
              ) : (
                rooms.map((r: any) => (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 font-bold text-gray-700 sticky left-0 bg-white">
                      {r.room_name}
                      <div className="text-[10px] text-gray-400 font-medium">{r.room_type}</div>
                    </td>
                    {days.map((d) => {
                      const items = cellSchedules(r.id, d);
                      return (
                        <td key={d.toISOString()} className="px-2 py-2 border-l border-gray-100 min-w-[140px]">
                          {items.map((s: any) => (
                            <div
                              key={s.id}
                              className={`mb-1 px-2 py-1 rounded text-[10px] font-bold ${
                                s.status === "Completed"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : s.status === "InProgress"
                                  ? "bg-amber-50 text-amber-700"
                                  : s.status === "Cancelled"
                                  ? "bg-rose-50 text-rose-700 line-through"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              <div className="font-mono">{s.start_time}–{s.end_time}</div>
                              <div>{s.surgery?.surgery_name}</div>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
