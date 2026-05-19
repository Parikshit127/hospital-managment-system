"use client";

import React, { useEffect, useState } from "react";
import { Settings, Loader2, Plus, Building2, Scissors, Pencil, X, Power } from "lucide-react";
import { AdminPage } from "@/app/admin/components/AdminPage";
import {
  listOTRooms,
  createOTRoom,
  updateOTRoom,
  listSurgeryMasters,
  createSurgeryMaster,
} from "@/app/actions/ot-actions";

// All 5 room types from the document
const ROOM_TYPES = ["Major OT", "Minor OT", "Cath Lab", "Endoscopy Suite", "Day Surgery"];

const inputCls  = "w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500";
const selectCls = "w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-orange-500";
const labelCls  = "block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5";

const EMPTY_ROOM = { room_name: "", room_type: "Major OT", floor: "", wing: "", equipment: "" };

function SectionLabel({ label, badge }: { label: string; badge: "mandatory" | "preferred" | "optional" }) {
  const colors = { mandatory: "bg-red-50 text-red-600 border-red-200", preferred: "bg-amber-50 text-amber-600 border-amber-200", optional: "bg-gray-100 text-gray-500 border-gray-200" };
  return (
    <div className="flex items-center gap-2 pt-2 pb-1 border-b border-gray-100 mb-2">
      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{label}</span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[badge]}`}>{badge}</span>
    </div>
  );
}

function FL({ label, badge }: { label: string; badge: "mandatory" | "preferred" | "optional" }) {
  const dot = { mandatory: "bg-red-400", preferred: "bg-amber-400", optional: "bg-gray-300" };
  return (
    <label className={`${labelCls} flex items-center gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot[badge]}`} />
      {label}{badge === "mandatory" && <span className="text-red-500 normal-case font-normal ml-0.5">*</span>}
    </label>
  );
}

export default function OTMasterSetupPage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [masters, setMasters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"rooms" | "surgeries">("rooms");

  // Room modal
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);
  const [roomSaving, setRoomSaving] = useState(false);

  // Surgery form
  const [masterForm, setMasterForm] = useState({
    surgery_code: "", surgery_name: "", category: "General",
    default_duration_mins: "60", surgeon_fee: "", anesthesia_fee: "", ot_charges: "",
  });

  const setR = (k: string, v: any) => setRoomForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [r, m] = await Promise.all([listOTRooms(), listSurgeryMasters()]);
    if (r.success) setRooms(r.data);
    if (m.success) setMasters(m.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreateRoom = () => { setEditingRoomId(null); setRoomForm(EMPTY_ROOM); setRoomModalOpen(true); };
  const openEditRoom = (room: any) => {
    setEditingRoomId(room.id);
    setRoomForm({
      room_name: room.room_name,
      room_type: room.room_type,
      floor: room.floor ?? "",
      wing: room.wing ?? "",
      equipment: Array.isArray(room.equipment) ? room.equipment.join(", ") : (room.equipment ?? ""),
    });
    setRoomModalOpen(true);
  };

  const handleSaveRoom = async () => {
    if (!roomForm.room_name.trim()) return;
    setRoomSaving(true);
    const payload = {
      room_name: roomForm.room_name.trim(),
      room_type: roomForm.room_type,
      floor: roomForm.floor || null,
      wing: roomForm.wing || null,
      equipment: roomForm.equipment ? roomForm.equipment.split(",").map(s => s.trim()).filter(Boolean) : null,
    };
    const res = editingRoomId
      ? await updateOTRoom(editingRoomId, payload)
      : await createOTRoom(payload);
    if (res.success) { setRoomModalOpen(false); load(); }
    else alert(res.error || "Failed");
    setRoomSaving(false);
  };

  const onToggleRoom = async (id: string, active: boolean) => {
    await updateOTRoom(id, { is_active: !active });
    load();
  };

  const onCreateMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createSurgeryMaster({
      surgery_code: masterForm.surgery_code,
      surgery_name: masterForm.surgery_name,
      category: masterForm.category,
      default_duration_mins: Number(masterForm.default_duration_mins) || 60,
      billing_components: {
        surgeon_fee: Number(masterForm.surgeon_fee) || 0,
        anesthesia_fee: Number(masterForm.anesthesia_fee) || 0,
        ot_charges: Number(masterForm.ot_charges) || 0,
      },
    });
    if (res.success) {
      setMasterForm({ surgery_code: "", surgery_name: "", category: "General", default_duration_mins: "60", surgeon_fee: "", anesthesia_fee: "", ot_charges: "" });
      load();
    } else alert(res.error || "Failed");
  };

  return (
    <AdminPage pageTitle="OT Master Setup" pageIcon={<Settings className="h-5 w-5" />} onRefresh={load} refreshing={loading}>
      <div className="flex items-center gap-2 mb-4">
        {(["rooms", "surgeries"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${tab === t ? "bg-orange-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {t === "rooms" ? "OT Rooms" : "Surgery Master"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : tab === "rooms" ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{rooms.length} room{rooms.length !== 1 ? "s" : ""} configured</p>
            <button onClick={openCreateRoom} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition">
              <Plus className="h-4 w-4" /> Add OT Room
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
              <Building2 className="mx-auto h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm font-bold">No OT Rooms configured</p>
              <p className="text-xs mt-1">Add your first OT room to start scheduling surgeries.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Room Name", "Type", "Floor / Wing", "Key Equipment", "Status", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rooms.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-900">{r.room_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-violet-50 text-violet-700 text-[10px] font-bold rounded-full">{r.room_type}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{[r.wing, r.floor].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                        {Array.isArray(r.equipment) && r.equipment.length > 0 ? r.equipment.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${r.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {r.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditRoom(r)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-600 transition" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => onToggleRoom(r.id, r.is_active)}
                            className={`p-1.5 hover:bg-gray-100 rounded-lg transition ${r.is_active ? "text-gray-400 hover:text-rose-600" : "text-gray-400 hover:text-emerald-600"}`}
                            title={r.is_active ? "Deactivate" : "Activate"}>
                            <Power className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={onCreateMaster} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Plus className="h-4 w-4" /> Add Surgery Master</h3>
            <input required value={masterForm.surgery_code} onChange={e => setMasterForm({ ...masterForm, surgery_code: e.target.value })} placeholder="Code (e.g. APP-001)" className={inputCls} />
            <input required value={masterForm.surgery_name} onChange={e => setMasterForm({ ...masterForm, surgery_name: e.target.value })} placeholder="Surgery name" className={inputCls} />
            <select value={masterForm.category} onChange={e => setMasterForm({ ...masterForm, category: e.target.value })} className={selectCls}>
              {["General", "Ortho", "Cardiac", "Neuro", "Gyn", "Uro", "ENT", "Ophthal", "Plastic"].map(c => <option key={c}>{c}</option>)}
            </select>
            <input type="number" value={masterForm.default_duration_mins} onChange={e => setMasterForm({ ...masterForm, default_duration_mins: e.target.value })} placeholder="Duration (min)" className={inputCls} />
            <div className="grid grid-cols-3 gap-2">
              <div><label className={labelCls}>Surgeon (₹)</label><input type="number" value={masterForm.surgeon_fee} onChange={e => setMasterForm({ ...masterForm, surgeon_fee: e.target.value })} placeholder="0" className={inputCls} /></div>
              <div><label className={labelCls}>Anesth. (₹)</label><input type="number" value={masterForm.anesthesia_fee} onChange={e => setMasterForm({ ...masterForm, anesthesia_fee: e.target.value })} placeholder="0" className={inputCls} /></div>
              <div><label className={labelCls}>OT (₹)</label><input type="number" value={masterForm.ot_charges} onChange={e => setMasterForm({ ...masterForm, ot_charges: e.target.value })} placeholder="0" className={inputCls} /></div>
            </div>
            <button type="submit" className="w-full px-4 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition">Add Surgery</button>
          </form>

          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Scissors className="h-4 w-4" /> Surgery Catalog ({masters.length})</h3>
            {masters.length === 0 ? <div className="text-xs text-gray-400">No surgeries in master.</div> : (
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  <tr>{["Code", "Name", "Category", "Duration", "Fees"].map(h => <th key={h} className="text-left py-2">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {masters.map((m: any) => {
                    const c = (m.billing_components as any) || {};
                    const total = (Number(c.surgeon_fee) || 0) + (Number(c.anesthesia_fee) || 0) + (Number(c.ot_charges) || 0);
                    return (
                      <tr key={m.id} className="border-t border-gray-100">
                        <td className="py-2 font-mono">{m.surgery_code}</td>
                        <td className="py-2 font-bold">{m.surgery_name}</td>
                        <td className="py-2">{m.category}</td>
                        <td className="py-2">{m.default_duration_mins} min</td>
                        <td className="py-2">₹{total.toLocaleString("en-IN")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* OT ROOM MODAL */}
      {roomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">{editingRoomId ? "Edit OT Room" : "Add OT Room"}</h2>
                <p className="text-[10px] text-gray-400 mt-0.5 flex gap-3">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Mandatory</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Preferred</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />Optional</span>
                </p>
              </div>
              <button onClick={() => setRoomModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <SectionLabel label="Basic Info" badge="mandatory" />
              <div>
                <FL label="Room Name" badge="mandatory" />
                <input type="text" required value={roomForm.room_name} onChange={e => setR("room_name", e.target.value)} placeholder="e.g. OT-1, Minor OT" className={inputCls} />
              </div>
              <div>
                <FL label="Room Type" badge="mandatory" />
                <select value={roomForm.room_type} onChange={e => setR("room_type", e.target.value)} className={selectCls}>
                  {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <SectionLabel label="Location" badge="preferred" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FL label="Floor / Wing" badge="preferred" />
                  <input type="text" value={roomForm.floor} onChange={e => setR("floor", e.target.value)} placeholder="e.g. OT Block, 3rd Floor" className={inputCls} />
                </div>
                <div>
                  <FL label="Wing" badge="preferred" />
                  <input type="text" value={roomForm.wing} onChange={e => setR("wing", e.target.value)} placeholder="e.g. East Wing" className={inputCls} />
                </div>
              </div>

              <SectionLabel label="Equipment" badge="preferred" />
              <div>
                <FL label="Key Equipment (comma-separated)" badge="preferred" />
                <input type="text" value={roomForm.equipment} onChange={e => setR("equipment", e.target.value)}
                  placeholder="e.g. Laparoscopy, C-Arm, Ventilator" className={inputCls} />
                <p className="text-[10px] text-gray-400 mt-1">Separate multiple items with commas</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => setRoomModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleSaveRoom} disabled={roomSaving || !roomForm.room_name.trim()}
                className="flex-1 py-2.5 bg-orange-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition flex items-center justify-center gap-2">
                {roomSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {roomSaving ? "Saving…" : editingRoomId ? "Save Changes" : "Add Room"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}