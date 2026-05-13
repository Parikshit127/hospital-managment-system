"use client";

import React, { useEffect, useState } from "react";
import { Settings, Loader2, Plus, Building2, Scissors } from "lucide-react";
import { AdminPage } from "@/app/admin/components/AdminPage";
import {
  listOTRooms,
  createOTRoom,
  updateOTRoom,
  listSurgeryMasters,
  createSurgeryMaster,
} from "@/app/actions/ot-actions";

export default function OTMasterSetupPage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [masters, setMasters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"rooms" | "surgeries">("rooms");

  const [roomForm, setRoomForm] = useState({
    room_name: "",
    room_type: "Major",
    floor: "",
    wing: "",
    equipment: "",
  });
  const [masterForm, setMasterForm] = useState({
    surgery_code: "",
    surgery_name: "",
    category: "General",
    default_duration_mins: "60",
    surgeon_fee: "",
    anesthesia_fee: "",
    ot_charges: "",
  });

  const load = async () => {
    setLoading(true);
    const [r, m] = await Promise.all([listOTRooms(), listSurgeryMasters()]);
    if (r.success) setRooms(r.data);
    if (m.success) setMasters(m.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await createOTRoom({
      room_name: roomForm.room_name,
      room_type: roomForm.room_type,
      floor: roomForm.floor || null,
      wing: roomForm.wing || null,
      equipment: roomForm.equipment
        ? roomForm.equipment.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
    });
    if (res.success) {
      setRoomForm({ room_name: "", room_type: "Major", floor: "", wing: "", equipment: "" });
      load();
    } else {
      alert(res.error || "Failed");
    }
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
      setMasterForm({
        surgery_code: "",
        surgery_name: "",
        category: "General",
        default_duration_mins: "60",
        surgeon_fee: "",
        anesthesia_fee: "",
        ot_charges: "",
      });
      load();
    } else {
      alert(res.error || "Failed");
    }
  };

  return (
    <AdminPage
      pageTitle="OT Master Setup"
      pageIcon={<Settings className="h-5 w-5" />}
      onRefresh={load}
      refreshing={loading}
    >
      <div className="flex items-center gap-2 mb-4">
        {(["rooms", "surgeries"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
              tab === t
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t === "rooms" ? "OT Rooms" : "Surgery Master"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : tab === "rooms" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={onCreateRoom} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add OT Room
            </h3>
            <input
              required
              value={roomForm.room_name}
              onChange={(e) => setRoomForm({ ...roomForm, room_name: e.target.value })}
              placeholder="Room name (e.g. OT-1)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <select
              value={roomForm.room_type}
              onChange={(e) => setRoomForm({ ...roomForm, room_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {["Major", "Minor", "Cath Lab", "Endo Suite"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input
              value={roomForm.floor}
              onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
              placeholder="Floor"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              value={roomForm.wing}
              onChange={(e) => setRoomForm({ ...roomForm, wing: e.target.value })}
              placeholder="Wing"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              value={roomForm.equipment}
              onChange={(e) => setRoomForm({ ...roomForm, equipment: e.target.value })}
              placeholder="Equipment (comma-separated)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700"
            >
              Add Room
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Configured Rooms ({rooms.length})
            </h3>
            {rooms.length === 0 ? (
              <div className="text-xs text-gray-400">No rooms yet.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  <tr>
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Location</th>
                    <th className="text-left py-2">Equipment</th>
                    <th className="text-right py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r: any) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="py-2 font-bold">{r.room_name}</td>
                      <td className="py-2">{r.room_type}</td>
                      <td className="py-2">
                        {[r.wing, r.floor].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-2 text-gray-500">
                        {Array.isArray(r.equipment) ? r.equipment.join(", ") : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => onToggleRoom(r.id, r.is_active)}
                          className={`px-2 py-1 rounded text-[10px] font-bold ${
                            r.is_active
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {r.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={onCreateMaster} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Surgery Master
            </h3>
            <input
              required
              value={masterForm.surgery_code}
              onChange={(e) => setMasterForm({ ...masterForm, surgery_code: e.target.value })}
              placeholder="Code (e.g. APP-001)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              required
              value={masterForm.surgery_name}
              onChange={(e) => setMasterForm({ ...masterForm, surgery_name: e.target.value })}
              placeholder="Surgery name"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <select
              value={masterForm.category}
              onChange={(e) => setMasterForm({ ...masterForm, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {["General", "Ortho", "Cardiac", "Neuro", "Gyn", "Uro", "ENT", "Ophthal", "Plastic"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              value={masterForm.default_duration_mins}
              onChange={(e) => setMasterForm({ ...masterForm, default_duration_mins: e.target.value })}
              placeholder="Duration (min)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                value={masterForm.surgeon_fee}
                onChange={(e) => setMasterForm({ ...masterForm, surgeon_fee: e.target.value })}
                placeholder="Surgeon"
                className="px-2 py-1.5 border border-gray-200 rounded text-xs"
              />
              <input
                type="number"
                value={masterForm.anesthesia_fee}
                onChange={(e) => setMasterForm({ ...masterForm, anesthesia_fee: e.target.value })}
                placeholder="Anesth."
                className="px-2 py-1.5 border border-gray-200 rounded text-xs"
              />
              <input
                type="number"
                value={masterForm.ot_charges}
                onChange={(e) => setMasterForm({ ...masterForm, ot_charges: e.target.value })}
                placeholder="OT"
                className="px-2 py-1.5 border border-gray-200 rounded text-xs"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700"
            >
              Add Surgery
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Scissors className="h-4 w-4" /> Surgery Catalog ({masters.length})
            </h3>
            {masters.length === 0 ? (
              <div className="text-xs text-gray-400">No surgeries in master.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  <tr>
                    <th className="text-left py-2">Code</th>
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Category</th>
                    <th className="text-right py-2">Duration</th>
                    <th className="text-right py-2">Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {masters.map((m: any) => {
                    const c = (m.billing_components as any) || {};
                    const total =
                      (Number(c.surgeon_fee) || 0) + (Number(c.anesthesia_fee) || 0) + (Number(c.ot_charges) || 0);
                    return (
                      <tr key={m.id} className="border-t border-gray-100">
                        <td className="py-2 font-mono">{m.surgery_code}</td>
                        <td className="py-2 font-bold">{m.surgery_name}</td>
                        <td className="py-2">{m.category}</td>
                        <td className="py-2 text-right">{m.default_duration_mins} min</td>
                        <td className="py-2 text-right">{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AdminPage>
  );
}
