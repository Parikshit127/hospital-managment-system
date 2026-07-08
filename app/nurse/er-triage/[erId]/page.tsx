"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Brain, Loader2 } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getERPatient, triageERPatient } from "@/app/actions/er-actions";

const LEVELS = [
  { level: "1", color: "Red", label: "Resuscitation", bg: "bg-rose-500", desc: "Immediate, life-saving intervention required" },
  { level: "2", color: "Orange", label: "Emergent", bg: "bg-orange-500", desc: "High risk; multiple resources expected; should be seen <10 min" },
  { level: "3", color: "Yellow", label: "Urgent", bg: "bg-amber-400", desc: "Stable; needs multiple resources; can wait" },
  { level: "4", color: "Green", label: "Less Urgent", bg: "bg-emerald-500", desc: "Single resource (e.g. one lab); can wait" },
  { level: "5", color: "Blue", label: "Non-Urgent", bg: "bg-blue-500", desc: "No additional resources; can be triaged out / clinic" },
];

export default function NurseERTriageActionPage() {
  const params = useParams<{ erId: string }>();
  const router = useRouter();
  const id = params?.erId as string;
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [bedId, setBedId] = useState("");
  const [user, setUser] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getERPatient(id).then((r) => {
      if (r.success) {
        setPatient(r.data);
        setPicked(r.data.triage_level ?? null);
        setBedId(r.data.bed_id ?? "");
      }
      setLoading(false);
    });
    fetch("/api/session")
      .then((r) => r.json())
      .then((s) => setUser(s?.id ?? "unknown"));
  }, [id]);

  const onSubmit = async () => {
    if (!picked) {
      alert("Pick a triage level");
      return;
    }
    setSaving(true);
    const res = await triageERPatient({
      er_registration_id: id,
      triage_level: picked as "1" | "2" | "3" | "4" | "5",
      triage_nurse_id: user || "unknown",
      bed_id: bedId || null,
    });
    setSaving(false);
    if (res.success) {
      router.push("/nurse/er-triage");
    } else {
      alert(res.error || "Failed");
    }
  };

  return (
    <AppShell pageTitle="Perform ER Triage" pageIcon={<Brain className="h-5 w-5" />}>
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !patient ? (
        <div className="py-20 text-center text-sm text-gray-400">ER patient not found.</div>
      ) : (
        <div className="space-y-5 max-w-3xl">
          {/* Patient Header Details */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">
              Patient Case: {patient.er_number}
            </div>
            <h2 className="text-xl font-black text-gray-800">{patient.patient_name}</h2>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs pt-3 border-t border-gray-100">
              <div>
                <span className="text-gray-400 block uppercase font-bold text-[9px]">Age / Gender</span>
                <span className="font-semibold text-gray-700">
                  {patient.age_estimate || "N/A"} / {patient.gender || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block uppercase font-bold text-[9px]">Arrival Mode</span>
                <span className="font-semibold text-gray-700">{patient.arrival_mode || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-400 block uppercase font-bold text-[9px]">Brought By</span>
                <span className="font-semibold text-gray-700">{patient.brought_by || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-400 block uppercase font-bold text-[9px]">Chief Complaint</span>
                <span className="font-semibold text-gray-700 truncate block max-w-xs">{patient.chief_complaint}</span>
              </div>
            </div>
          </div>

          {/* ESI Triage Levels Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 pl-1">
              Select Emergency Severity Index (ESI) Level
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {LEVELS.map((l) => (
                <button
                  key={l.level}
                  onClick={() => setPicked(l.level)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
                    picked === l.level
                      ? `${l.bg} text-white border-transparent shadow-md shadow-rose-500/10`
                      : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`px-2.5 py-1 rounded text-xs font-black ${
                        picked === l.level ? "bg-white/20" : `${l.bg} text-white`
                      }`}
                    >
                      ESI {l.level}
                    </div>
                    <div className="font-black text-base">{l.label}</div>
                  </div>
                  <p className={`mt-2 text-xs leading-relaxed ${picked === l.level ? "text-white/95" : "text-gray-500"}`}>
                    {l.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Bed Allocation & Actions */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 pl-0.5">
                Assign Bed (Optional)
              </label>
              <input
                value={bedId}
                onChange={(e) => setBedId(e.target.value)}
                placeholder="Enter bed ID or number"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-rose-500 transition-colors"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => router.push("/nurse/er-triage")}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onSubmit}
                disabled={saving || !picked}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50 transition-colors shadow-md shadow-rose-500/10"
              >
                {saving ? "Saving…" : "Confirm Triage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
