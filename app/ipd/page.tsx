"use client";

import React, { useState, useEffect } from "react";
import {
  Bed,
  Users,
  Activity,
  Clock,
  RefreshCw,
  Loader2,
  ChevronRight,
  Search,
  Plus,
  Eye,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  HeartPulse,
  Building2,
  Stethoscope,
  FileText,
  Shield,
  CircleDollarSign,
  ClipboardList,
  UserPlus,
  Thermometer,
  XCircle,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import {
  getWardsWithBeds,
  getAllBeds,
  getIPDAdmissions,
  getIPDStats,
  admitPatientIPD,
  updateBedStatus,
  dischargePatientIPD,
  searchPatientsForAdmission,
  addMedicalNote,
  accrueIPDDailyCharges,
  findAssignedDoctorByPatientPhone,
} from "@/app/actions/ipd-actions";
import { AppShell } from "@/app/components/layout/AppShell";

export default function IPDDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [wards, setWards] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [admissions, setAdmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [admissionFilter, setAdmissionFilter] = useState("Admitted");

  // Admit modal
  const [admitModal, setAdmitModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [admitForm, setAdmitForm] = useState({
    bed_id: "",
    ward_id: "",
    diagnosis: "",
    doctor_name: "",
  });
  const [admitLoading, setAdmitLoading] = useState(false);
  const [admitError, setAdmitError] = useState("");

  // Discharge modal
  const [dischargeModal, setDischargeModal] = useState<any>(null);
  const [dischargeNotes, setDischargeNotes] = useState("");
  const [dischargeLoading, setDischargeLoading] = useState(false);

  // Search assigned doctor by patient phone
  const [doctorLookupPhone, setDoctorLookupPhone] = useState("");
  const [doctorLookupLoading, setDoctorLookupLoading] = useState(false);
  const [doctorLookupResults, setDoctorLookupResults] = useState<{
    admissions: any[];
    patients: any[];
    doctors: any[];
  }>({ admissions: [], patients: [], doctors: [] });
  const [doctorLookupError, setDoctorLookupError] = useState("");

  // Note modal
  const [noteModal, setNoteModal] = useState<any>(null);
  const [noteForm, setNoteForm] = useState({
    type: "Routine Check",
    details: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, w, b, a] = await Promise.all([
        getIPDStats(),
        getWardsWithBeds(),
        getAllBeds(),
        getIPDAdmissions(admissionFilter),
      ]);
      if (s.success) setStats(s.data);
      if (w.success) setWards(w.data || []);
      if (b.success) setBeds(b.data || []);
      if (a.success) setAdmissions(a.data || []);
    } catch (err) {
      console.error("IPD load error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [admissionFilter]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length >= 2) {
      const res = await searchPatientsForAdmission(q);
      if (res.success) setSearchResults(res.data || []);
    } else {
      setSearchResults([]);
    }
  };

  const handleAdmit = async () => {
    setAdmitError("");
    if (
      !selectedPatient ||
      !admitForm.bed_id ||
      !admitForm.ward_id ||
      !admitForm.diagnosis
    ) {
      setAdmitError(
        "Please fill in all required fields: patient, ward, bed, and diagnosis.",
      );
      return;
    }
    const wardId = parseInt(admitForm.ward_id);
    if (isNaN(wardId)) {
      setAdmitError("Invalid ward selection. Please select a ward.");
      return;
    }
    setAdmitLoading(true);
    try {
      const res = await admitPatientIPD({
        patient_id: selectedPatient.patient_id,
        bed_id: admitForm.bed_id,
        ward_id: wardId,
        diagnosis: admitForm.diagnosis,
        doctor_name: admitForm.doctor_name,
      });
      if (res.success) {
        setAdmitModal(false);
        setSelectedPatient(null);
        setAdmitForm({
          bed_id: "",
          ward_id: "",
          diagnosis: "",
          doctor_name: "",
        });
        setAdmitError("");
        loadData();
      } else {
        setAdmitError(
          res.error || "Failed to admit patient. Please try again.",
        );
      }
    } catch (err: any) {
      console.error(err);
      setAdmitError(err.message || "An unexpected error occurred.");
    }
    setAdmitLoading(false);
  };

  const handleDischarge = async () => {
    if (!dischargeModal) return;
    setDischargeLoading(true);
    try {
      const res = await dischargePatientIPD(
        dischargeModal.admission_id,
        dischargeNotes,
      );
      if (res.success) {
        setDischargeModal(null);
        setDischargeNotes("");
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
    setDischargeLoading(false);
  };

  const handleAddNote = async () => {
    if (!noteModal || !noteForm.details) return;
    await addMedicalNote(
      noteModal.admission_id,
      noteForm.type,
      noteForm.details,
    );
    setNoteModal(null);
    setNoteForm({ type: "Routine Check", details: "" });
    loadData();
  };

  const handleBedStatusChange = async (bedId: string, newStatus: string) => {
    await updateBedStatus(bedId, newStatus);
    loadData();
  };

  const handleDoctorLookup = async () => {
    setDoctorLookupError("");
    const query = doctorLookupPhone.trim();
    if (query.length < 3) {
      setDoctorLookupError(
        "Please enter at least 3 characters of mobile number.",
      );
      setDoctorLookupResults({ admissions: [], patients: [], doctors: [] });
      return;
    }

    setDoctorLookupLoading(true);
    try {
      const res = await findAssignedDoctorByPatientPhone(query);
      if (res.success) {
        const payload = res.data || {};
        setDoctorLookupResults({
          admissions: Array.isArray(payload.admissions)
            ? payload.admissions
            : [],
          patients: Array.isArray(payload.patients) ? payload.patients : [],
          doctors: Array.isArray(payload.doctors) ? payload.doctors : [],
        });
      } else {
        setDoctorLookupError(
          res.error || "Failed to search patient by mobile number.",
        );
        setDoctorLookupResults({ admissions: [], patients: [], doctors: [] });
      }
    } catch (err: any) {
      setDoctorLookupError(err?.message || "Search failed. Please try again.");
      setDoctorLookupResults({ admissions: [], patients: [], doctors: [] });
    }
    setDoctorLookupLoading(false);
  };

  useEffect(() => {
    const value = doctorLookupPhone.trim();
    if (value.length < 3) {
      setDoctorLookupResults({ admissions: [], patients: [], doctors: [] });
      setDoctorLookupError("");
      return;
    }

    const timer = setTimeout(() => {
      handleDoctorLookup();
    }, 350);

    return () => clearTimeout(timer);
  }, [doctorLookupPhone]);

  const getBedStatusColor = (status: string) => {
    const map: Record<string, string> = {
      Available: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
      Occupied: "bg-rose-500/20 border-rose-500/30 text-rose-400",
      Maintenance: "bg-amber-500/20 border-amber-500/30 text-amber-400",
      Reserved: "bg-blue-500/20 border-blue-500/30 text-blue-400",
      Cleaning: "bg-cyan-500/20 border-cyan-500/30 text-cyan-400",
      Isolation: "bg-red-500/20 border-red-500/30 text-red-400",
      Blocked: "bg-slate-500/20 border-slate-500/30 text-slate-400",
    };
    return (
      map[status || "Available"] || "bg-gray-100 border-gray-200 text-gray-500"
    );
  };

  const availableBeds = beds.filter((b) => b.status === "Available");

  return (
    <AppShell
      pageTitle="IPD Management"
      pageIcon={<Bed className="h-5 w-5" />}
      onRefresh={loadData}
      refreshing={loading}
      headerActions={
        <button
          onClick={() => setAdmitModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-violet-500/20 flex items-center gap-2"
        >
          <UserPlus className="h-3.5 w-3.5" /> Admit Patient
        </button>
      }
    >
      <div className="space-y-8">
        {/* TITLE + TABS */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-gray-900">
              Inpatient Dashboard
            </h2>
            <p className="text-gray-500 mt-1 font-medium">
              Bed management, admissions, and patient care
            </p>
          </div>
          <div className="flex gap-2">
            {["overview", "beds", "admissions"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === tab ? "bg-violet-500/20 text-violet-400 border border-violet-500/30" : "bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-900"}`}
              >
                {tab === "overview"
                  ? "Overview"
                  : tab === "beds"
                    ? "Bed Map"
                    : "Admissions"}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Search - visible on /ipd regardless of tab */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 md:p-5 space-y-3">
          <h3 className="font-black text-gray-700 text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-violet-400" /> Search By
            Patient/Doctor Mobile
          </h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={doctorLookupPhone}
              onChange={(e) => setDoctorLookupPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleDoctorLookup();
                }
              }}
              placeholder="Enter patient or doctor mobile / doctor name"
              className="flex-1 px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-500/50 focus:outline-none"
            />
            <button
              onClick={handleDoctorLookup}
              disabled={doctorLookupLoading}
              className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {doctorLookupLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Search
            </button>
          </div>

          {doctorLookupError && (
            <p className="text-xs text-rose-400 font-medium">
              {doctorLookupError}
            </p>
          )}

          {!doctorLookupError &&
            doctorLookupPhone.trim().length >= 3 &&
            !doctorLookupLoading &&
            doctorLookupResults.admissions.length === 0 &&
            doctorLookupResults.doctors.length === 0 && (
              <p className="text-xs text-gray-400 font-medium">
                No current admission found for this search input.
              </p>
            )}

          {doctorLookupResults.doctors.length > 0 && (
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                Matched Doctors
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Doctor
                    </th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Username
                    </th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Mobile
                    </th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Specialty
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {doctorLookupResults.doctors.map((row: any) => (
                    <tr
                      key={row.doctor_id}
                      className="border-b border-gray-200 last:border-b-0"
                    >
                      <td className="px-3 py-2.5 text-xs font-bold text-violet-500">
                        {row.doctor_name}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {row.username}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {row.phone}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {row.specialty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {doctorLookupResults.admissions.length > 0 && (
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                Matching Current Admissions
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Patient
                    </th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Mobile
                    </th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Assigned Doctor
                    </th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Ward / Bed
                    </th>
                    <th className="text-left px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {doctorLookupResults.admissions.map((row: any) => (
                    <tr
                      key={row.admission_id}
                      className="border-b border-gray-200 last:border-b-0"
                    >
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-bold text-gray-700">
                          {row.patient_name}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {row.patient_id}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {row.phone}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold text-violet-500">
                        {row.doctor_name}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {row.ward_name} / {row.bed_id}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
              <p className="text-gray-400 font-bold text-sm">
                Loading IPD data...
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* KPI CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-violet-500/30 transition-all overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                    Admitted
                  </span>
                  <div className="p-1.5 bg-violet-500/10 rounded-lg">
                    <Users className="h-3.5 w-3.5 text-violet-400" />
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900 tracking-tight">
                  {stats?.totalAdmitted || 0}
                </p>
                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-violet-400">
                  <Activity className="h-3 w-3" /> Active patients
                </div>
              </div>

              <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-emerald-500/30 transition-all overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                    Available Beds
                  </span>
                  <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                    <Bed className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900 tracking-tight">
                  {stats?.availableBeds || 0}
                </p>
                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-emerald-400">
                  <CheckCircle className="h-3 w-3" /> of {stats?.totalBeds || 0}{" "}
                  total
                </div>
              </div>

              <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-amber-500/30 transition-all overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                    Occupancy
                  </span>
                  <div className="p-1.5 bg-amber-500/10 rounded-lg">
                    <Activity className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900 tracking-tight">
                  {stats?.occupancyRate || 0}%
                </p>
                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-amber-400">
                  <Bed className="h-3 w-3" /> {stats?.occupiedBeds || 0}{" "}
                  occupied
                </div>
              </div>

              <div className="group relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:border-teal-500/30 transition-all overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
                    Discharged
                  </span>
                  <div className="p-1.5 bg-teal-500/10 rounded-lg">
                    <CheckCircle className="h-3.5 w-3.5 text-teal-400" />
                  </div>
                </div>
                <p className="text-3xl font-black text-gray-900 tracking-tight">
                  {stats?.totalDischarged || 0}
                </p>
                <div className="flex items-center gap-1 mt-2 text-xs font-bold text-teal-400">
                  <ArrowUpRight className="h-3 w-3" /> All time
                </div>
              </div>
            </div>

            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Ward Summary */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-gray-200">
                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-violet-400" /> Ward
                      Overview
                    </h3>
                  </div>
                  <div className="p-5 space-y-3">
                    {wards.length === 0 ? (
                      <p className="text-xs text-gray-300 py-8 text-center">
                        No wards configured. Run seed script to populate.
                      </p>
                    ) : (
                      wards.map((ward: any) => (
                        <div
                          key={ward.ward_id}
                          className="p-4 bg-gray-50 border border-gray-200 rounded-xl"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="text-sm font-black text-gray-700">
                                {ward.ward_name}
                              </span>
                              <span className="ml-2 text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                {ward.ward_type}
                              </span>
                            </div>
                            <span className="text-xs font-mono text-gray-400">
                              {"\u20B9"}
                              {ward.cost_per_day}/day
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                                style={{
                                  width: `${ward.totalBeds > 0 ? (ward.occupied / ward.totalBeds) * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] font-black text-gray-500">
                              {ward.occupied}/{ward.totalBeds}
                            </span>
                          </div>
                          <div className="flex gap-3 mt-2 text-[10px] font-bold">
                            <span className="text-emerald-400">
                              {ward.available} free
                            </span>
                            <span className="text-amber-400">
                              {ward.maintenance} maint.
                            </span>
                            {ward.cleaning > 0 && (
                              <span className="text-cyan-400">
                                {ward.cleaning} cleaning
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Recent Admissions */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-black text-gray-700 flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-teal-400" /> Current
                      Admissions
                    </h3>
                    <span className="text-[10px] font-black text-gray-300">
                      {admissions.length} patients
                    </span>
                  </div>
                  <div className="max-h-[400px] overflow-auto">
                    {admissions.length === 0 ? (
                      <div className="py-16 flex flex-col items-center text-gray-300">
                        <Bed className="h-8 w-8 mb-2" />
                        <span className="text-xs font-bold">
                          No active admissions
                        </span>
                      </div>
                    ) : (
                      admissions.map((adm: any) => (
                        <div
                          key={adm.admission_id}
                          className="px-5 py-4 border-b border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-black text-gray-700">
                                {adm.patient?.full_name}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                {adm.patient?.patient_id} &bull; {adm.wardName}{" "}
                                &bull; Bed: {adm.bed_id || "N/A"}
                              </p>
                              <p className="text-[10px] text-gray-300 mt-0.5">
                                {adm.diagnosis}
                              </p>
                            </div>
                            <div className="text-right space-y-1">
                              <span className="text-[10px] font-black text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">
                                Day {adm.daysAdmitted}
                              </span>
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => setNoteModal(adm)}
                                  className="p-1 hover:bg-gray-100 rounded transition-all"
                                  title="Add Note"
                                >
                                  <ClipboardList className="h-3 w-3 text-gray-400 hover:text-gray-900" />
                                </button>
                                {adm.status === "Admitted" && (
                                  <button
                                    onClick={() => setDischargeModal(adm)}
                                    className="p-1 hover:bg-rose-500/10 rounded transition-all"
                                    title="Discharge"
                                  >
                                    <LogOut className="h-3 w-3 text-rose-400/50 hover:text-rose-400" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* BEDS TAB */}
            {activeTab === "beds" && (
              <div className="space-y-6">
                {wards.map((ward: any) => (
                  <div
                    key={ward.ward_id}
                    className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden"
                  >
                    <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="font-black text-gray-700 text-sm">
                          {ward.ward_name}
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-500/10 text-violet-400">
                          {ward.ward_type}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-gray-400">
                        {ward.occupied}/{ward.totalBeds} occupied
                      </span>
                    </div>
                    <div className="p-5 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                      {ward.beds.map((bed: any) => (
                        <div
                          key={bed.bed_id}
                          className={`relative group border rounded-xl p-3 text-center cursor-pointer transition-all ${getBedStatusColor(bed.status)}`}
                        >
                          <Bed className="h-5 w-5 mx-auto mb-1 opacity-70" />
                          <p className="text-[10px] font-black">{bed.bed_id}</p>
                          <p className="text-[8px] font-bold opacity-60">
                            {bed.status}
                          </p>
                          {/* Status change dropdown on hover */}
                          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg overflow-hidden z-10 hidden group-hover:block w-28 shadow-xl">
                            {["Available", "Maintenance", "Cleaning", "Blocked"]
                              .filter((s) => s !== bed.status)
                              .map((s) => (
                                <button
                                  key={s}
                                  onClick={() =>
                                    handleBedStatusChange(bed.bed_id, s)
                                  }
                                  className="block w-full text-left px-3 py-1.5 text-[10px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                >
                                  {s}
                                </button>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {wards.length === 0 && (
                  <div className="py-20 text-center text-gray-300">
                    <Building2 className="h-12 w-12 mx-auto mb-3" />
                    <p className="text-sm font-bold">No wards configured</p>
                    <p className="text-xs mt-1">
                      Run the seed script to populate wards and beds
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ADMISSIONS TAB */}
            {activeTab === "admissions" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {["Admitted", "Discharged"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setAdmissionFilter(f)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${admissionFilter === f ? "bg-violet-500/20 text-violet-400 border border-violet-500/30" : "bg-gray-100 text-gray-500 border border-gray-200"}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Patient
                          </th>
                          <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Ward / Bed
                          </th>
                          <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Diagnosis
                          </th>
                          <th className="text-left px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Doctor
                          </th>
                          <th className="text-center px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Days
                          </th>
                          <th className="text-right px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Est. Room
                          </th>
                          <th className="text-center px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {admissions.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-5 py-16 text-center text-gray-300"
                            >
                              <Users className="h-8 w-8 mx-auto mb-2" />
                              <p className="text-xs font-bold">
                                No {admissionFilter.toLowerCase()} patients
                              </p>
                            </td>
                          </tr>
                        ) : (
                          admissions.map((adm: any) => (
                            <tr
                              key={adm.admission_id}
                              className="border-b border-gray-200 hover:bg-gray-50"
                            >
                              <td className="px-5 py-3.5">
                                <p className="text-xs font-bold text-gray-700">
                                  {adm.patient?.full_name}
                                </p>
                                <p className="text-[10px] text-gray-400">
                                  {adm.patient?.patient_id}
                                </p>
                              </td>
                              <td className="px-5 py-3.5 text-xs text-gray-500">
                                {adm.wardName} / {adm.bed_id || "N/A"}
                              </td>
                              <td className="px-5 py-3.5 text-xs text-gray-500 max-w-[200px] truncate">
                                {adm.diagnosis || "-"}
                              </td>
                              <td className="px-5 py-3.5 text-xs text-gray-500">
                                {adm.doctor_name || "-"}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <span className="text-xs font-black text-violet-400">
                                  {adm.daysAdmitted}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-right text-xs font-bold text-emerald-400">
                                {"\u20B9"}
                                {adm.estimatedRoomCharge?.toLocaleString() ||
                                  "0"}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => setNoteModal(adm)}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg"
                                    title="Add Note"
                                  >
                                    <ClipboardList className="h-3.5 w-3.5 text-gray-500" />
                                  </button>
                                  {adm.status === "Admitted" && (
                                    <button
                                      onClick={() => setDischargeModal(adm)}
                                      className="p-1.5 hover:bg-rose-500/10 rounded-lg"
                                      title="Discharge"
                                    >
                                      <LogOut className="h-3.5 w-3.5 text-rose-400/60" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ADMIT MODAL */}
      {admitModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-violet-400" /> Admit Patient
              </h3>
              <button
                onClick={() => {
                  setAdmitModal(false);
                  setSelectedPatient(null);
                  setAdmitError("");
                }}
                className="text-gray-400 hover:text-gray-900 text-xl"
              >
                &times;
              </button>
            </div>

            {/* Patient search */}
            {!selectedPatient ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search patient by name, ID, or phone..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-500/50 focus:outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-auto space-y-1.5">
                  {searchResults.map((p: any) => (
                    <button
                      key={p.patient_id}
                      onClick={() => setSelectedPatient(p)}
                      className="w-full text-left p-3 bg-gray-100 hover:bg-violet-500/10 border border-gray-200 rounded-xl transition-all"
                    >
                      <p className="text-xs font-bold text-gray-700">
                        {p.full_name}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {p.patient_id} &bull; {p.phone}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-violet-400">
                      {selectedPatient.full_name}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {selectedPatient.patient_id}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPatient(null)}
                    className="text-gray-400 hover:text-gray-900"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                      Ward *
                    </label>
                    <select
                      value={admitForm.ward_id}
                      onChange={(e) => {
                        setAdmitForm({
                          ...admitForm,
                          ward_id: e.target.value,
                          bed_id: "",
                        });
                        setAdmitError("");
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="" className="bg-white text-gray-500">
                        Select Ward
                      </option>
                      {wards.map((w: any) => (
                        <option
                          key={w.ward_id}
                          value={w.ward_id}
                          className="bg-white text-gray-900"
                        >
                          {w.ward_name} ({w.available} free)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                      Bed *
                    </label>
                    <select
                      value={admitForm.bed_id}
                      onChange={(e) => {
                        const bedId = e.target.value;
                        const selectedBed = availableBeds.find(
                          (b) => b.bed_id === bedId,
                        );
                        setAdmitForm({
                          ...admitForm,
                          bed_id: bedId,
                          ward_id: selectedBed
                            ? String(selectedBed.ward_id)
                            : admitForm.ward_id,
                        });
                        setAdmitError("");
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="" className="bg-white text-gray-500">
                        {admitForm.ward_id ? "Select Bed" : "Select ward first"}
                      </option>
                      {availableBeds
                        .filter((b) =>
                          admitForm.ward_id
                            ? b.ward_id === parseInt(admitForm.ward_id)
                            : false,
                        )
                        .map((b: any) => (
                          <option
                            key={b.bed_id}
                            value={b.bed_id}
                            className="bg-white text-gray-900"
                          >
                            {b.bed_id}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                    Diagnosis
                  </label>
                  <input
                    type="text"
                    value={admitForm.diagnosis}
                    onChange={(e) =>
                      setAdmitForm({ ...admitForm, diagnosis: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:border-violet-500/50 focus:outline-none"
                    placeholder="Primary diagnosis"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                    Doctor
                  </label>
                  <input
                    type="text"
                    value={admitForm.doctor_name}
                    onChange={(e) =>
                      setAdmitForm({
                        ...admitForm,
                        doctor_name: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:border-violet-500/50 focus:outline-none"
                    placeholder="Attending doctor"
                  />
                </div>

                {admitError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-400 font-medium">
                      {admitError}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleAdmit}
                  disabled={
                    admitLoading ||
                    !admitForm.bed_id ||
                    !admitForm.ward_id ||
                    !admitForm.diagnosis
                  }
                  className="w-full py-3 bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-black rounded-xl hover:shadow-lg hover:shadow-violet-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {admitLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Admit Patient
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISCHARGE MODAL */}
      {dischargeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <LogOut className="h-5 w-5 text-rose-400" /> Discharge Patient
              </h3>
              <button
                onClick={() => setDischargeModal(null)}
                className="text-gray-400 hover:text-gray-900 text-xl"
              >
                &times;
              </button>
            </div>
            <div className="bg-gray-100 rounded-xl p-3 text-xs space-y-1">
              <p className="font-bold text-gray-700">
                {dischargeModal.patient?.full_name}
              </p>
              <p className="text-gray-400">
                Ward: {dischargeModal.wardName} &bull; Bed:{" "}
                {dischargeModal.bed_id} &bull; Day {dischargeModal.daysAdmitted}
              </p>
              <p className="text-amber-400 font-bold">
                Est. Room Charge: {"\u20B9"}
                {dischargeModal.estimatedRoomCharge?.toLocaleString()}
              </p>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                Discharge Notes
              </label>
              <textarea
                value={dischargeNotes}
                onChange={(e) => setDischargeNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:border-rose-500/50 focus:outline-none"
                placeholder="Discharge instructions..."
              />
            </div>
            <button
              onClick={handleDischarge}
              disabled={dischargeLoading}
              className="w-full py-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-black rounded-xl hover:shadow-lg hover:shadow-rose-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {dischargeLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Confirm Discharge
            </button>
          </div>
        </div>
      )}

      {/* NOTE MODAL */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-teal-400" /> Add Medical
                Note
              </h3>
              <button
                onClick={() => setNoteModal(null)}
                className="text-gray-400 hover:text-gray-900 text-xl"
              >
                &times;
              </button>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                Note Type
              </label>
              <select
                value={noteForm.type}
                onChange={(e) =>
                  setNoteForm({ ...noteForm, type: e.target.value })
                }
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none"
              >
                {[
                  "Admission Note",
                  "Routine Check",
                  "Nursing",
                  "Discharge Advice",
                  "Doctor Visit",
                ].map((t) => (
                  <option key={t} value={t} className="bg-white text-gray-900">
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                Details
              </label>
              <textarea
                value={noteForm.details}
                onChange={(e) =>
                  setNoteForm({ ...noteForm, details: e.target.value })
                }
                rows={4}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:border-teal-500/50 focus:outline-none"
                placeholder="Note details..."
              />
            </div>
            <button
              onClick={handleAddNote}
              disabled={!noteForm.details}
              className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-sm font-black rounded-xl hover:shadow-lg hover:shadow-teal-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-4 w-4" /> Save Note
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
