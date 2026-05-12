"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  listSurgeryRequests,
  listOTRooms,
  scheduleSurgery,
} from "@/app/actions/ot-actions";

type TeamRow = {
  role: string;
  doctor_id: string;
  staff_name: string;
  specialty: string;
};

function ScheduleSurgeryInner() {
  const params = useSearchParams();
  const router = useRouter();
  const preselectId = params.get("id") ?? "";

  const [requests, setRequests] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    surgery_request_id: preselectId,
    ot_room_id: "",
    scheduled_date: new Date().toISOString().slice(0, 10),
    start_time: "09:00",
    end_time: "10:00",
  });
  const [team, setTeam] = useState<TeamRow[]>([
    { role: "Primary Surgeon", doctor_id: "", staff_name: "", specialty: "" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([listSurgeryRequests({ status: "Approved" }), listOTRooms()]).then(
      ([reqRes, roomRes]) => {
        if (reqRes.success) setRequests(reqRes.data);
        if (roomRes.success) setRooms(roomRes.data);
        setLoading(false);
      },
    );
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.surgery_request_id || !form.ot_room_id) {
      alert("Pick a request and a room");
      return;
    }
    setSaving(true);
    const res = await scheduleSurgery({
      ...form,
      team: team.filter((t) => t.staff_name),
    });
    setSaving(false);
    if (res.success) {
      router.push("/ot/calendar");
    } else {
      alert(res.error || "Failed to schedule");
    }
  };

  return (
    <AppShell
      pageTitle="Schedule Surgery"
      pageIcon={<CalendarClock className="h-5 w-5" />}
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 max-w-3xl">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Approved Surgery Request *
            </label>
            <select
              value={form.surgery_request_id}
              onChange={(e) => setForm({ ...form, surgery_request_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              required
            >
              <option value="">Select…</option>
              {requests.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.request_number} · {r.surgery_name} · {r.patient_id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                OT Room *
              </label>
              <select
                value={form.ot_room_id}
                onChange={(e) => setForm({ ...form, ot_room_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                required
              >
                <option value="">Select…</option>
                {rooms.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.room_name} ({r.room_type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={form.scheduled_date}
                onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Start time *
              </label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                End time *
              </label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-700">Surgery Team</h3>
              <button
                type="button"
                onClick={() =>
                  setTeam([...team, { role: "Asst Surgeon", doctor_id: "", staff_name: "", specialty: "" }])
                }
                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
              >
                <Plus className="h-3 w-3" /> Add member
              </button>
            </div>
            <div className="space-y-2">
              {team.map((m, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                  <select
                    value={m.role}
                    onChange={(e) => {
                      const next = [...team];
                      next[idx].role = e.target.value;
                      setTeam(next);
                    }}
                    className="px-2 py-1.5 border border-gray-200 rounded text-xs"
                  >
                    {[
                      "Primary Surgeon",
                      "Asst Surgeon",
                      "Anesthetist",
                      "Scrub Nurse",
                      "Circulating Nurse",
                    ].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Staff name"
                    value={m.staff_name}
                    onChange={(e) => {
                      const next = [...team];
                      next[idx].staff_name = e.target.value;
                      setTeam(next);
                    }}
                    className="px-2 py-1.5 border border-gray-200 rounded text-xs"
                  />
                  <input
                    placeholder="Specialty / notes"
                    value={m.specialty}
                    onChange={(e) => {
                      const next = [...team];
                      next[idx].specialty = e.target.value;
                      setTeam(next);
                    }}
                    className="px-2 py-1.5 border border-gray-200 rounded text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setTeam(team.filter((_, i) => i !== idx))}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {saving ? "Scheduling…" : "Confirm Schedule"}
            </button>
          </div>
        </form>
      )}
    </AppShell>
  );
}

export default function ScheduleSurgeryPage() {
  return (
    <Suspense fallback={<div className="p-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}>
      <ScheduleSurgeryInner />
    </Suspense>
  );
}
