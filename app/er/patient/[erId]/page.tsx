"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  ClipboardList,
  FileText,
  HeartPulse,
  Loader2,
  LogOut,
  Plus,
} from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  getERPatient,
  recordERVitals,
  createEROrder,
  updateEROrderStatus,
  saveERNote,
  dischargeERPatient,
} from "@/app/actions/er-actions";

export default function ERPatientPage() {
  const params = useParams<{ erId: string }>();
  const router = useRouter();
  const id = params?.erId as string;
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState("");
  const [tab, setTab] = useState<"vitals" | "orders" | "notes">("vitals");

  const [vitalsForm, setVitalsForm] = useState({
    bp_systolic: "",
    bp_diastolic: "",
    heart_rate: "",
    respiratory_rate: "",
    temperature: "",
    spo2: "",
    gcs_eye: "",
    gcs_verbal: "",
    gcs_motor: "",
    pain_scale: "",
    blood_sugar: "",
  });
  const [orderForm, setOrderForm] = useState({
    order_type: "Lab" as "Lab" | "Radiology" | "Medication" | "Procedure" | "Blood",
    order_details: "",
    priority: "Stat" as "Stat" | "Urgent" | "Routine",
  });
  const [noteForm, setNoteForm] = useState({
    note_type: "Assessment" as "Assessment" | "Procedure" | "Progress" | "Discharge",
    content: "",
  });

  const load = async () => {
    const r = await getERPatient(id);
    if (r.success) setPatient(r.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch("/api/session")
      .then((r) => r.json())
      .then((s) => setUser(s?.name || s?.username || "unknown"));
  }, [id]);

  const onSubmitVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await recordERVitals({
      er_registration_id: id,
      recorded_by: user,
      bp_systolic: vitalsForm.bp_systolic ? Number(vitalsForm.bp_systolic) : null,
      bp_diastolic: vitalsForm.bp_diastolic ? Number(vitalsForm.bp_diastolic) : null,
      heart_rate: vitalsForm.heart_rate ? Number(vitalsForm.heart_rate) : null,
      respiratory_rate: vitalsForm.respiratory_rate ? Number(vitalsForm.respiratory_rate) : null,
      temperature: vitalsForm.temperature ? Number(vitalsForm.temperature) : null,
      spo2: vitalsForm.spo2 ? Number(vitalsForm.spo2) : null,
      gcs_eye: vitalsForm.gcs_eye ? Number(vitalsForm.gcs_eye) : null,
      gcs_verbal: vitalsForm.gcs_verbal ? Number(vitalsForm.gcs_verbal) : null,
      gcs_motor: vitalsForm.gcs_motor ? Number(vitalsForm.gcs_motor) : null,
      pain_scale: vitalsForm.pain_scale ? Number(vitalsForm.pain_scale) : null,
      blood_sugar: vitalsForm.blood_sugar ? Number(vitalsForm.blood_sugar) : null,
    });
    if (res.success) {
      setVitalsForm({
        bp_systolic: "",
        bp_diastolic: "",
        heart_rate: "",
        respiratory_rate: "",
        temperature: "",
        spo2: "",
        gcs_eye: "",
        gcs_verbal: "",
        gcs_motor: "",
        pain_scale: "",
        blood_sugar: "",
      });
      load();
    } else {
      alert(res.error || "Failed");
    }
  };

  const onSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createEROrder({
      er_registration_id: id,
      order_type: orderForm.order_type,
      order_details: orderForm.order_details,
      priority: orderForm.priority,
      ordered_by: user,
    });
    if (res.success) {
      setOrderForm({ ...orderForm, order_details: "" });
      load();
    } else {
      alert(res.error || "Failed");
    }
  };

  const onSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await saveERNote({
      er_registration_id: id,
      note_type: noteForm.note_type,
      content: noteForm.content,
      created_by: user,
    });
    if (res.success) {
      setNoteForm({ ...noteForm, content: "" });
      load();
    } else {
      alert(res.error || "Failed");
    }
  };

  const onDischarge = async (disposition: "Discharged" | "LAMA" | "Death" | "Referred") => {
    if (!confirm(`Confirm disposition: ${disposition}?`)) return;
    const res = await dischargeERPatient({ er_registration_id: id, disposition });
    if (res.success) {
      router.push("/er/dashboard");
    } else {
      alert(res.error || "Failed");
    }
  };

  return (
    <AppShell pageTitle="ER Patient" pageIcon={<HeartPulse className="h-5 w-5" />}>
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !patient ? (
        <div className="py-20 text-center text-sm text-gray-400">Not found.</div>
      ) : (
        <div className="space-y-4">
          {/* Header card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {patient.er_number} · arrived {new Date(patient.arrival_time).toLocaleString()}
              </div>
              <div className="text-xl font-black text-gray-800">{patient.patient_name}</div>
              <div className="text-sm text-gray-600">{patient.chief_complaint}</div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                {patient.triage_color && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">
                    ESI {patient.triage_level} · {patient.triage_color}
                  </span>
                )}
                {patient.is_mlc && (
                  <Link
                    href={`/er/mlc/${id}`}
                    className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold flex items-center gap-1"
                  >
                    <AlertTriangle className="h-3 w-3" /> MLC
                  </Link>
                )}
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-bold">{patient.status}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={`/er/transfer/${id}`}
                className="px-2.5 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 flex items-center gap-1"
              >
                <ArrowRightLeft className="h-3 w-3" /> Transfer to IP
              </Link>
              <button
                onClick={() => onDischarge("Discharged")}
                className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-100 flex items-center gap-1"
              >
                <LogOut className="h-3 w-3" /> Discharge
              </button>
              <button
                onClick={() => onDischarge("LAMA")}
                className="px-2.5 py-1.5 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg hover:bg-amber-100"
              >
                LAMA
              </button>
              <button
                onClick={() => onDischarge("Death")}
                className="px-2.5 py-1.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-lg hover:bg-rose-100"
              >
                Death
              </button>
              <button
                onClick={() => onDischarge("Referred")}
                className="px-2.5 py-1.5 bg-purple-50 text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-100"
              >
                Refer
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2">
            {(["vitals", "orders", "notes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                  tab === t
                    ? "bg-rose-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t === "vitals" ? "Vitals" : t === "orders" ? "Orders" : "Notes"}
              </button>
            ))}
          </div>

          {tab === "vitals" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <form onSubmit={onSubmitVitals} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Record Vitals
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <In label="BP sys" value={vitalsForm.bp_systolic} onChange={(v) => setVitalsForm({ ...vitalsForm, bp_systolic: v })} />
                  <In label="BP dia" value={vitalsForm.bp_diastolic} onChange={(v) => setVitalsForm({ ...vitalsForm, bp_diastolic: v })} />
                  <In label="HR" value={vitalsForm.heart_rate} onChange={(v) => setVitalsForm({ ...vitalsForm, heart_rate: v })} />
                  <In label="RR" value={vitalsForm.respiratory_rate} onChange={(v) => setVitalsForm({ ...vitalsForm, respiratory_rate: v })} />
                  <In label="Temp °C" value={vitalsForm.temperature} onChange={(v) => setVitalsForm({ ...vitalsForm, temperature: v })} />
                  <In label="SpO2 %" value={vitalsForm.spo2} onChange={(v) => setVitalsForm({ ...vitalsForm, spo2: v })} />
                  <In label="GCS Eye (1-4)" value={vitalsForm.gcs_eye} onChange={(v) => setVitalsForm({ ...vitalsForm, gcs_eye: v })} />
                  <In label="GCS Verbal (1-5)" value={vitalsForm.gcs_verbal} onChange={(v) => setVitalsForm({ ...vitalsForm, gcs_verbal: v })} />
                  <In label="GCS Motor (1-6)" value={vitalsForm.gcs_motor} onChange={(v) => setVitalsForm({ ...vitalsForm, gcs_motor: v })} />
                  <In label="Pain (0-10)" value={vitalsForm.pain_scale} onChange={(v) => setVitalsForm({ ...vitalsForm, pain_scale: v })} />
                  <In label="Blood sugar" value={vitalsForm.blood_sugar} onChange={(v) => setVitalsForm({ ...vitalsForm, blood_sugar: v })} />
                </div>
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-lg hover:bg-rose-700"
                >
                  Save Vitals
                </button>
              </form>
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-3">Vitals History</h3>
                {patient.er_vitals?.length === 0 ? (
                  <div className="text-xs text-gray-400">No vitals recorded.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                      <tr>
                        <th className="text-left py-1">Time</th>
                        <th className="text-left py-1">BP</th>
                        <th className="text-left py-1">HR</th>
                        <th className="text-left py-1">SpO2</th>
                        <th className="text-left py-1">GCS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patient.er_vitals.map((v: any) => (
                        <tr key={v.id} className="border-t border-gray-100">
                          <td className="py-1.5">
                            {new Date(v.recorded_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-1.5">
                            {v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : "—"}
                          </td>
                          <td className="py-1.5">{v.heart_rate ?? "—"}</td>
                          <td className="py-1.5">{v.spo2 ? `${v.spo2}%` : "—"}</td>
                          <td className="py-1.5">{v.gcs_total ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === "orders" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <form onSubmit={onSubmitOrder} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> New Order
                </h3>
                <select
                  value={orderForm.order_type}
                  onChange={(e) => setOrderForm({ ...orderForm, order_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {["Lab", "Radiology", "Medication", "Procedure", "Blood"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <textarea
                  required
                  value={orderForm.order_details}
                  onChange={(e) => setOrderForm({ ...orderForm, order_details: e.target.value })}
                  placeholder="Order details"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <select
                  value={orderForm.priority}
                  onChange={(e) => setOrderForm({ ...orderForm, priority: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {["Stat", "Urgent", "Routine"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-lg hover:bg-rose-700 flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" /> Add Order
                </button>
              </form>
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-3">Active Orders</h3>
                {patient.er_orders?.length === 0 ? (
                  <div className="text-xs text-gray-400">No orders yet.</div>
                ) : (
                  <div className="space-y-2">
                    {patient.er_orders.map((o: any) => (
                      <div key={o.id} className="border-l-2 border-rose-300 pl-3 py-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                              {o.order_type} · {o.priority}
                            </span>
                            <div className="text-sm text-gray-700">{o.order_details}</div>
                          </div>
                          <select
                            value={o.status}
                            onChange={(e) =>
                              updateEROrderStatus(o.id, e.target.value as any).then(load)
                            }
                            className="text-xs px-2 py-1 border border-gray-200 rounded"
                          >
                            <option>Ordered</option>
                            <option>InProgress</option>
                            <option>Completed</option>
                            <option>Cancelled</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "notes" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <form onSubmit={onSubmitNote} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Add Note
                </h3>
                <select
                  value={noteForm.note_type}
                  onChange={(e) => setNoteForm({ ...noteForm, note_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {["Assessment", "Procedure", "Progress", "Discharge"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <textarea
                  required
                  value={noteForm.content}
                  onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                  placeholder="Note content"
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-lg hover:bg-rose-700"
                >
                  Save Note
                </button>
              </form>
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-3">Clinical Notes</h3>
                {patient.er_notes?.length === 0 ? (
                  <div className="text-xs text-gray-400">No notes yet.</div>
                ) : (
                  <div className="space-y-3">
                    {patient.er_notes.map((n: any) => (
                      <div key={n.id} className="border-l-2 border-gray-300 pl-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          {n.note_type} · {new Date(n.created_at).toLocaleString()} · {n.created_by}
                        </div>
                        <div className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{n.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function In({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </label>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
      />
    </div>
  );
}
