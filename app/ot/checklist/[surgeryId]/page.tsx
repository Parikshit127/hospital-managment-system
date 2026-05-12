"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getSurgeryRequest, saveOTChecklist } from "@/app/actions/ot-actions";

type ChecklistItems = Record<string, boolean | string>;

const SIGN_IN_ITEMS = [
  { key: "identity_confirmed", label: "Patient identity confirmed" },
  { key: "consent_signed", label: "Consent signed" },
  { key: "site_marked", label: "Surgical site marked" },
  { key: "anesthesia_check", label: "Anesthesia machine and medication check complete" },
  { key: "allergies_known", label: "Patient allergies reviewed" },
  { key: "airway_risk", label: "Difficult airway risk assessed" },
  { key: "blood_loss_risk", label: "Blood loss risk > 500 ml assessed" },
];

const TIME_OUT_ITEMS = [
  { key: "team_intro", label: "All team members introduced by name and role" },
  { key: "patient_procedure_site_confirmed", label: "Patient, procedure, and site confirmed" },
  { key: "antibiotic_given", label: "Antibiotic prophylaxis given within last 60 min" },
  { key: "imaging_displayed", label: "Essential imaging displayed" },
  { key: "anticipated_critical_events", label: "Anticipated critical events reviewed" },
];

const SIGN_OUT_ITEMS = [
  { key: "instrument_sponge_count", label: "Instrument, sponge, needle counts correct" },
  { key: "specimen_labeled", label: "Specimen labelled (including patient name)" },
  { key: "equipment_problems", label: "Equipment problems addressed" },
  { key: "recovery_plan", label: "Key recovery and post-op plan reviewed" },
];

export default function OTChecklistPage() {
  const params = useParams<{ surgeryId: string }>();
  const id = params?.surgeryId as string;
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<any>(null);
  const [signIn, setSignIn] = useState<ChecklistItems>({});
  const [timeOut, setTimeOut] = useState<ChecklistItems>({});
  const [signOut, setSignOut] = useState<ChecklistItems>({});
  const [user, setUser] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    getSurgeryRequest(id).then((r) => {
      if (r.success) {
        setRequest(r.data);
        setSignIn((r.data.checklist?.sign_in as any) || {});
        setTimeOut((r.data.checklist?.time_out as any) || {});
        setSignOut((r.data.checklist?.sign_out as any) || {});
      }
      setLoading(false);
    });
    fetch("/api/session")
      .then((r) => r.json())
      .then((s) => setUser(s?.name || s?.username || ""));
  }, [id]);

  const save = async (
    phase: "sign_in" | "time_out" | "sign_out",
    data: ChecklistItems,
  ) => {
    if (!user) {
      alert("Cannot identify signer");
      return;
    }
    setSaving(phase);
    const res = await saveOTChecklist({
      surgery_request_id: id,
      phase,
      data,
      signed_by: user,
    });
    setSaving(null);
    if (res.success) {
      alert(`${phase.replace("_", " ").toUpperCase()} saved`);
      const r = await getSurgeryRequest(id);
      if (r.success) setRequest(r.data);
    } else {
      alert(res.error || "Save failed");
    }
  };

  return (
    <AppShell pageTitle="WHO Surgical Safety Checklist" pageIcon={<ShieldCheck className="h-5 w-5" />}>
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !request ? (
        <div className="py-20 text-center text-sm text-gray-400">Surgery request not found.</div>
      ) : (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {request.request_number}
            </div>
            <div className="text-lg font-black text-gray-800">{request.surgery_name}</div>
            <div className="text-xs text-gray-500">Patient {request.patient_id}</div>
          </div>

          <Phase
            title="1. Sign In (before anesthesia)"
            items={SIGN_IN_ITEMS}
            state={signIn}
            setState={setSignIn}
            signedBy={request.checklist?.sign_in_by}
            signedAt={request.checklist?.sign_in_at}
            onSave={() => save("sign_in", signIn)}
            saving={saving === "sign_in"}
          />
          <Phase
            title="2. Time Out (before incision)"
            items={TIME_OUT_ITEMS}
            state={timeOut}
            setState={setTimeOut}
            signedBy={request.checklist?.time_out_by}
            signedAt={request.checklist?.time_out_at}
            onSave={() => save("time_out", timeOut)}
            saving={saving === "time_out"}
          />
          <Phase
            title="3. Sign Out (before leaving OT)"
            items={SIGN_OUT_ITEMS}
            state={signOut}
            setState={setSignOut}
            signedBy={request.checklist?.sign_out_by}
            signedAt={request.checklist?.sign_out_at}
            onSave={() => save("sign_out", signOut)}
            saving={saving === "sign_out"}
          />
        </div>
      )}
    </AppShell>
  );
}

function Phase({
  title,
  items,
  state,
  setState,
  signedBy,
  signedAt,
  onSave,
  saving,
}: {
  title: string;
  items: { key: string; label: string }[];
  state: ChecklistItems;
  setState: (s: ChecklistItems) => void;
  signedBy?: string | null;
  signedAt?: string | null;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {signedAt && (
          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> Signed by {signedBy} ·{" "}
            {new Date(signedAt).toLocaleString()}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <label key={it.key} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={Boolean(state[it.key])}
              onChange={(e) => setState({ ...state, [it.key]: e.target.checked })}
              className="rounded border-gray-300"
            />
            {it.label}
          </label>
        ))}
      </div>
      <div className="flex justify-end mt-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save & Sign"}
        </button>
      </div>
    </div>
  );
}
