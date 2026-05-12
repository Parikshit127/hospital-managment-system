"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Loader2, Plus, Pill } from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  getSurgeryRequest,
  saveSurgeryNote,
  addSurgeryConsumable,
} from "@/app/actions/ot-actions";

export default function SurgeryNotesPage() {
  const params = useParams<{ surgeryId: string }>();
  const id = params?.surgeryId as string;
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<any>(null);
  const [user, setUser] = useState("");
  const [noteForm, setNoteForm] = useState({
    note_type: "Pre-Op" as "Pre-Op" | "Intra-Op" | "Post-Op" | "Anesthesia",
    content: "",
    findings: "",
    complications: "",
    blood_loss_ml: "",
    duration_mins: "",
  });
  const [consumableForm, setConsumableForm] = useState({
    item_name: "",
    item_code: "",
    quantity: "1",
    unit_price: "",
    is_implant: false,
    batch_no: "",
    serial_no: "",
  });

  const load = async () => {
    const r = await getSurgeryRequest(id);
    if (r.success) setRequest(r.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch("/api/session")
      .then((r) => r.json())
      .then((s) => setUser(s?.name || s?.username || ""));
  }, [id]);

  const onAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await saveSurgeryNote({
      surgery_request_id: id,
      note_type: noteForm.note_type,
      content: noteForm.content,
      findings: noteForm.findings || null,
      complications: noteForm.complications || null,
      blood_loss_ml: noteForm.blood_loss_ml ? Number(noteForm.blood_loss_ml) : null,
      duration_mins: noteForm.duration_mins ? Number(noteForm.duration_mins) : null,
      created_by: user || "unknown",
    });
    if (res.success) {
      setNoteForm({ ...noteForm, content: "", findings: "", complications: "" });
      load();
    } else {
      alert(res.error || "Failed");
    }
  };

  const onAddConsumable = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await addSurgeryConsumable({
      surgery_request_id: id,
      item_name: consumableForm.item_name,
      item_code: consumableForm.item_code || null,
      quantity: Number(consumableForm.quantity) || 1,
      unit_price: consumableForm.unit_price ? Number(consumableForm.unit_price) : null,
      is_implant: consumableForm.is_implant,
      batch_no: consumableForm.batch_no || null,
      serial_no: consumableForm.serial_no || null,
    });
    if (res.success) {
      setConsumableForm({
        item_name: "",
        item_code: "",
        quantity: "1",
        unit_price: "",
        is_implant: false,
        batch_no: "",
        serial_no: "",
      });
      load();
    } else {
      alert(res.error || "Failed");
    }
  };

  return (
    <AppShell pageTitle="Surgery Notes" pageIcon={<FileText className="h-5 w-5" />}>
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !request ? (
        <div className="py-20 text-center text-sm text-gray-400">Surgery request not found.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {request.request_number}
              </div>
              <div className="text-lg font-black text-gray-800">{request.surgery_name}</div>
              <div className="text-xs text-gray-500">Patient {request.patient_id}</div>
            </div>

            <form onSubmit={onAddNote} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-800">Add Note</h3>
              <select
                value={noteForm.note_type}
                onChange={(e) => setNoteForm({ ...noteForm, note_type: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                {["Pre-Op", "Intra-Op", "Post-Op", "Anesthesia"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <textarea
                value={noteForm.content}
                onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                placeholder="Note content"
                rows={4}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <input
                value={noteForm.findings}
                onChange={(e) => setNoteForm({ ...noteForm, findings: e.target.value })}
                placeholder="Findings"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <input
                value={noteForm.complications}
                onChange={(e) => setNoteForm({ ...noteForm, complications: e.target.value })}
                placeholder="Complications (if any)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={noteForm.blood_loss_ml}
                  onChange={(e) => setNoteForm({ ...noteForm, blood_loss_ml: e.target.value })}
                  placeholder="Blood loss (ml)"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <input
                  type="number"
                  value={noteForm.duration_mins}
                  onChange={(e) => setNoteForm({ ...noteForm, duration_mins: e.target.value })}
                  placeholder="Duration (min)"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add Note
              </button>
            </form>

            <form onSubmit={onAddConsumable} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Pill className="h-4 w-4" /> Add Consumable / Implant
              </h3>
              <input
                value={consumableForm.item_name}
                onChange={(e) => setConsumableForm({ ...consumableForm, item_name: e.target.value })}
                placeholder="Item name"
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={consumableForm.item_code}
                  onChange={(e) => setConsumableForm({ ...consumableForm, item_code: e.target.value })}
                  placeholder="Code"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <input
                  type="number"
                  value={consumableForm.quantity}
                  onChange={(e) => setConsumableForm({ ...consumableForm, quantity: e.target.value })}
                  placeholder="Qty"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  value={consumableForm.unit_price}
                  onChange={(e) => setConsumableForm({ ...consumableForm, unit_price: e.target.value })}
                  placeholder="Unit price"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={consumableForm.is_implant}
                  onChange={(e) => setConsumableForm({ ...consumableForm, is_implant: e.target.checked })}
                />
                Implant (track serial number)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={consumableForm.batch_no}
                  onChange={(e) => setConsumableForm({ ...consumableForm, batch_no: e.target.value })}
                  placeholder="Batch #"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <input
                  value={consumableForm.serial_no}
                  onChange={(e) => setConsumableForm({ ...consumableForm, serial_no: e.target.value })}
                  placeholder="Serial # (implants)"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700"
              >
                Add Item
              </button>
            </form>
          </div>

          <div className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">Notes ({request.notes?.length ?? 0})</h3>
              {request.notes?.length ? (
                <div className="space-y-3">
                  {request.notes.map((n: any) => (
                    <div key={n.id} className="border-l-2 border-blue-300 pl-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                        {n.note_type} · {new Date(n.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{n.content}</div>
                      {n.findings && (
                        <div className="text-xs text-gray-500 mt-1">
                          <strong>Findings:</strong> {n.findings}
                        </div>
                      )}
                      {n.complications && (
                        <div className="text-xs text-rose-600 mt-1">
                          <strong>Complications:</strong> {n.complications}
                        </div>
                      )}
                      {(n.blood_loss_ml || n.duration_mins) && (
                        <div className="text-xs text-gray-400 mt-1">
                          {n.blood_loss_ml ? `Blood loss: ${n.blood_loss_ml} ml · ` : ""}
                          {n.duration_mins ? `Duration: ${n.duration_mins} min` : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400">No notes yet.</div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-3">
                Consumables / Implants ({request.consumables?.length ?? 0})
              </h3>
              {request.consumables?.length ? (
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    <tr>
                      <th className="text-left py-1">Item</th>
                      <th className="text-left py-1">Qty</th>
                      <th className="text-right py-1">Price</th>
                      <th className="text-right py-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.consumables.map((c: any) => (
                      <tr key={c.id} className="border-t border-gray-100">
                        <td className="py-1.5">
                          {c.item_name}
                          {c.is_implant && (
                            <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px] font-bold">
                              IMPLANT
                            </span>
                          )}
                        </td>
                        <td className="py-1.5">{c.quantity}</td>
                        <td className="py-1.5 text-right">{c.unit_price ?? "—"}</td>
                        <td className="py-1.5 text-right font-bold">
                          {c.unit_price ? (c.unit_price * c.quantity).toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs text-gray-400">No items added yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
