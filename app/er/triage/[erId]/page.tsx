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

export default function ERTriagePage() {
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
      router.push(`/er/patient/${id}`);
    } else {
      alert(res.error || "Failed");
    }
  };

  return (
    <AppShell pageTitle="ER Triage (ESI)" pageIcon={<Brain className="h-5 w-5" />}>
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !patient ? (
        <div className="py-20 text-center text-sm text-gray-400">ER patient not found.</div>
      ) : (
        <div className="space-y-5 max-w-3xl">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">{patient.er_number}</div>
            <div className="text-lg font-black text-gray-800">{patient.patient_name}</div>
            <div className="text-sm text-gray-600">{patient.chief_complaint}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {LEVELS.map((l) => (
              <button
                key={l.level}
                onClick={() => setPicked(l.level)}
                className={`text-left p-5 rounded-xl border-2 transition-all ${
                  picked === l.level
                    ? `${l.bg} text-white border-transparent shadow-lg`
                    : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`px-2.5 py-1 rounded text-sm font-black ${
                      picked === l.level ? "bg-white/20" : `${l.bg} text-white`
                    }`}
                  >
                    ESI {l.level}
                  </div>
                  <div className="font-black text-lg">{l.label}</div>
                </div>
                <p className={`mt-2 text-xs ${picked === l.level ? "text-white/90" : "text-gray-500"}`}>
                  {l.desc}
                </p>
              </button>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Assign bed (optional)
              </label>
              <input
                value={bedId}
                onChange={(e) => setBedId(e.target.value)}
                placeholder="Bed ID"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => router.back()}
                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={onSubmit}
                disabled={saving || !picked}
                className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
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
