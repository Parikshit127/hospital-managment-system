"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  Loader2,
  Scissors,
  Stethoscope,
  Building2,
  TimerReset,
  Plus,
} from "lucide-react";
import { AdminPage } from "@/app/admin/components/AdminPage";
import { getOTDashboard, getOTStats } from "@/app/actions/ot-actions";

export default function OTDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [d, s] = await Promise.all([getOTDashboard(), getOTStats(30)]);
    if (d.success) setData(d.data);
    if (s.success) setStats(s.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AdminPage
      pageTitle="Operation Theatre"
      pageIcon={<Scissors className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
      headerActions={
        <Link
          href="/ot/requests?create=1"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" /> Schedule Patient
        </Link>
      }
    >
      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPI
              icon={<CalendarDays className="h-4 w-4 text-blue-500" />}
              label="Today's Surgeries"
              value={data?.today_schedules?.length ?? 0}
            />
            <KPI
              icon={<ClipboardList className="h-4 w-4 text-amber-500" />}
              label="Pending Requests"
              value={data?.pending_requests ?? 0}
            />
            <KPI
              icon={<Activity className="h-4 w-4 text-emerald-500" />}
              label="In Progress"
              value={data?.in_progress ?? 0}
            />
            <KPI
              icon={<Building2 className="h-4 w-4 text-purple-500" />}
              label="Active Rooms"
              value={data?.active_rooms ?? 0}
            />
          </div>

          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI label="Last 30d completed" value={stats.completed} />
              <KPI label="Last 30d cancelled" value={stats.cancelled} />
              <KPI label="Cancellation rate" value={`${stats.cancellation_rate}%`} />
              <KPI
                icon={<TimerReset className="h-4 w-4 text-cyan-500" />}
                label="Avg duration (min)"
                value={stats.avg_duration_mins}
              />
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickLink href="/ot/calendar" label="OT Calendar" />
            <QuickLink href="/ot/requests" label="Surgery Requests" />
            <QuickLink href="/ot/worklist" label="Today's Worklist" />
            <QuickLink href="/ot/pac" label="PAC Clearance" />
            <QuickLink href="/ot/schedule" label="Schedule Surgery" />
            <QuickLink href="/ot/billing" label="OT Billing" />
            <QuickLink href="/ot/reports" label="OT Reports" />
            <QuickLink href="/admin/ot-setup" label="OT Master Setup" />
          </div>

          {/* Today's schedules */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-bold text-gray-700">Today&apos;s Schedule</h3>
            </div>
            {data?.today_schedules?.length ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                  <tr>
                    <th className="text-left px-4 py-2">Time</th>
                    <th className="text-left px-4 py-2">Room</th>
                    <th className="text-left px-4 py-2">Patient</th>
                    <th className="text-left px-4 py-2">Surgery</th>
                    <th className="text-left px-4 py-2">PAC</th>
                    <th className="text-left px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.today_schedules.map((s: any) => (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-mono text-xs">
                        {s.start_time}–{s.end_time}
                      </td>
                      <td className="px-4 py-2">{s.ot_room?.room_name}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {s.surgery?.patient_id}
                      </td>
                      <td className="px-4 py-2">{s.surgery?.surgery_name}</td>
                      <td className="px-4 py-2 text-xs">
                        {s.surgery?.pac
                          ? s.surgery.pac.fitness_status
                          : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-sm text-gray-400">
                No surgeries scheduled for today.
              </div>
            )}
          </div>
        </div>
      )}
    </AdminPage>
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

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all"
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Scheduled: "bg-blue-100 text-blue-700",
    InProgress: "bg-amber-100 text-amber-700",
    Completed: "bg-emerald-100 text-emerald-700",
    Cancelled: "bg-rose-100 text-rose-700",
    Delayed: "bg-orange-100 text-orange-700",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
        map[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}
