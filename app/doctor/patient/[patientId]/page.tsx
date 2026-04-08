"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  User,
  CalendarDays,
  Clock,
  ClipboardList,
  Activity,
  FlaskConical,
  Pill,
  Stethoscope,
  HeartPulse,
  Phone,
  Mail,
  MapPin,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { Sidebar } from "@/app/components/layout/Sidebar";
import { getPatientTimeline } from "@/app/actions/doctor-actions";
import IPDJourneyTab from "@/app/admin/patients/[patientId]/tabs/IPDJourneyTab";

type SessionType = {
  id: string;
  username: string;
  role: string;
  name?: string;
  specialty?: string;
} | null;

export default function DoctorPatientDetailsPage() {
  const params = useParams<{ patientId: string }>();
  const searchParams = useSearchParams();
  const patientId = String(params?.patientId || "");
  const selectedAppointmentId = searchParams.get("appointmentId") || "";

  const [session, setSession] = useState<SessionType>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timelineData, setTimelineData] = useState<any>(null);

  useEffect(() => {
    async function init() {
      try {
        const [sessionRes, patientRes] = await Promise.all([
          fetch("/api/session"),
          getPatientTimeline(patientId),
        ]);

        if (sessionRes.ok) {
          const s = await sessionRes.json();
          setSession(s);
        }

        if (patientRes.success) {
          setTimelineData(patientRes.data);
          setError("");
        } else {
          setError("Unable to load patient details.");
        }
      } catch (e) {
        console.error("Patient details load failed", e);
        setError("Something went wrong while loading patient details.");
      } finally {
        setLoading(false);
      }
    }

    if (patientId) init();
  }, [patientId]);

  const patient = timelineData?.patient;
  const timeline: any[] = timelineData?.timeline || [];
  const vitals: any[] = timelineData?.vitals || [];
  const ipdAdmissions: any[] = timelineData?.admissions || [];

  const appointments = useMemo(
    () => timeline.filter((t) => t.type === "appointment"),
    [timeline],
  );
  const clinicalNotes = useMemo(
    () => timeline.filter((t) => t.type === "clinical_note"),
    [timeline],
  );
  const labOrders = useMemo(
    () => timeline.filter((t) => t.type === "lab_order"),
    [timeline],
  );
  const prescriptions = useMemo(
    () => timeline.filter((t) => t.type === "prescription"),
    [timeline],
  );
  const admissions = useMemo(
    () => timeline.filter((t) => t.type === "admission"),
    [timeline],
  );
  const followUps = useMemo(
    () => timeline.filter((t) => t.type === "follow_up"),
    [timeline],
  );

  const selectedAppointment = useMemo(() => {
    if (!selectedAppointmentId) return appointments[0] || null;
    return (
      appointments.find((a) => a?.data?.id === selectedAppointmentId) ||
      appointments[0] ||
      null
    );
  }, [appointments, selectedAppointmentId]);

  const fmtDate = (v?: string | Date | null) => {
    if (!v) return "N/A";
    const d = new Date(v);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const fmtDateTime = (v?: string | Date | null) => {
    if (!v) return "N/A";
    const d = new Date(v);
    const datePart = fmtDate(d);
    const timePart = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart}, ${timePart}`;
  };

  const relativeTime = (v?: string | Date | null) => {
    if (!v) return "";
    const ts = new Date(v).getTime();
    const diffMs = Date.now() - ts;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  };

  const getEventMeta = (item: any) => {
    switch (item.type) {
      case "appointment":
        return {
          label: "Appointment",
          icon: CalendarDays,
          style: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "clinical_note":
        return {
          label: "Clinical Note",
          icon: ClipboardList,
          style: "bg-teal-50 text-teal-700 border-teal-200",
        };
      case "lab_order":
        return {
          label: "Lab Order",
          icon: FlaskConical,
          style: "bg-amber-50 text-amber-700 border-amber-200",
        };
      case "prescription":
        return {
          label: "Prescription",
          icon: Pill,
          style: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      case "admission":
        return {
          label: "Admission",
          icon: Stethoscope,
          style: "bg-rose-50 text-rose-700 border-rose-200",
        };
      case "follow_up":
        return {
          label: "Follow-Up",
          icon: UserCheck,
          style: "bg-indigo-50 text-indigo-700 border-indigo-200",
        };
      default:
        return {
          label: "Timeline Event",
          icon: Activity,
          style: "bg-violet-50 text-violet-700 border-violet-200",
        };
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const normalized = status.toLowerCase();
    if (normalized === "completed") {
      return {
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: CheckCircle2,
      };
    }
    if (normalized === "cancelled" || normalized === "rejected") {
      return {
        cls: "bg-rose-50 text-rose-700 border-rose-200",
        icon: AlertTriangle,
      };
    }
    return {
      cls: "bg-amber-50 text-amber-700 border-amber-200",
      icon: Clock,
    };
  };

  const renderEventDetails = (item: any) => {
    const data = item.data || {};

    if (item.type === "appointment") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
          <p>
            <span className="font-bold text-gray-500">Doctor:</span>{" "}
            {data.doctor || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Department:</span>{" "}
            {data.dept || "N/A"}
          </p>
          <p className="md:col-span-2">
            <span className="font-bold text-gray-500">Reason:</span>{" "}
            {data.reason || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Appointment ID:</span>{" "}
            {data.id || "N/A"}
          </p>
        </div>
      );
    }

    if (item.type === "clinical_note") {
      return (
        <div className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-bold text-gray-500">Diagnosis:</span>{" "}
            {data.diagnosis || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Doctor:</span>{" "}
            {data.doctor || "N/A"}
          </p>
          <p className="text-gray-600 leading-relaxed">
            <span className="font-bold text-gray-500">Notes:</span>{" "}
            {data.notes ? String(data.notes).slice(0, 260) : "N/A"}
            {data.notes && String(data.notes).length > 260 ? "..." : ""}
          </p>
        </div>
      );
    }

    if (item.type === "lab_order") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
          <p>
            <span className="font-bold text-gray-500">Test:</span>{" "}
            {data.test || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Barcode:</span>{" "}
            {data.barcode || "N/A"}
          </p>
          <p className="md:col-span-2">
            <span className="font-bold text-gray-500">Result:</span>{" "}
            {data.result || "Pending"}
          </p>
        </div>
      );
    }

    if (item.type === "prescription") {
      return (
        <div className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-bold text-gray-500">Prescription ID:</span>{" "}
            {data.id || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Medicines:</span>{" "}
            {data.items || "N/A"}
          </p>
        </div>
      );
    }

    if (item.type === "admission") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
          <p>
            <span className="font-bold text-gray-500">Admission ID:</span>{" "}
            {data.id || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Doctor:</span>{" "}
            {data.doctor || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Diagnosis:</span>{" "}
            {data.diagnosis || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Discharge Date:</span>{" "}
            {fmtDate(data.discharge)}
          </p>
        </div>
      );
    }

    if (item.type === "follow_up") {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
          <p>
            <span className="font-bold text-gray-500">Follow-Up ID:</span>{" "}
            {data.id || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Assigned Doctor:</span>{" "}
            {data.doctor_id || "N/A"}
          </p>
          <p className="md:col-span-2">
            <span className="font-bold text-gray-500">Instructions:</span>{" "}
            {data.notes || "N/A"}
          </p>
          <p>
            <span className="font-bold text-gray-500">Created On:</span>{" "}
            {fmtDateTime(data.created_at)}
          </p>
        </div>
      );
    }

    return (
      <div className="text-sm text-gray-700">
        <pre className="whitespace-pre-wrap font-sans">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden relative">
      <Sidebar session={session} />

      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <Link
              href="/doctor/dashboard"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-bold border border-gray-200 bg-white rounded-xl hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
            {patient && (
              <span className="text-xs font-black uppercase tracking-wider bg-teal-500/10 text-teal-700 border border-teal-500/20 px-3 py-1 rounded-lg">
                Patient ID: {patient.patient_id}
              </span>
            )}
          </div>

          {loading ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500 font-bold">
              Loading patient details...
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-10 text-center text-rose-700 font-bold">
              {error}
            </div>
          ) : !patient ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-500 font-bold">
              Patient not found.
            </div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-7">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 flex items-center gap-3">
                      <span className="h-11 w-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <User className="h-6 w-6 text-indigo-600" />
                      </span>
                      {patient.full_name}
                    </h1>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-gray-600">
                      <span className="bg-gray-100 border border-gray-200 rounded-lg px-2 py-1">
                        {patient.age || "N/A"}y / {patient.gender || "N/A"}
                      </span>
                      <span className="bg-gray-100 border border-gray-200 rounded-lg px-2 py-1">
                        Department: {patient.department || "General"}
                      </span>
                      <span className="bg-gray-100 border border-gray-200 rounded-lg px-2 py-1">
                        Registered: {fmtDateTime(patient.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
                      <Phone className="h-4 w-4 text-teal-600" />
                      <span>{patient.phone || "N/A"}</span>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-cyan-600" />
                      <span className="truncate">{patient.email || "N/A"}</span>
                    </div>
                    <div className="sm:col-span-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-violet-600" />
                      <span>{patient.address || "N/A"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {[
                  {
                    label: "Appointments",
                    value: appointments.length,
                    icon: CalendarDays,
                    cls: "text-blue-600 bg-blue-50 border-blue-100",
                  },
                  {
                    label: "Clinical Notes",
                    value: clinicalNotes.length,
                    icon: ClipboardList,
                    cls: "text-teal-600 bg-teal-50 border-teal-100",
                  },
                  {
                    label: "Labs",
                    value: labOrders.length,
                    icon: FlaskConical,
                    cls: "text-amber-600 bg-amber-50 border-amber-100",
                  },
                  {
                    label: "Prescriptions",
                    value: prescriptions.length,
                    icon: Pill,
                    cls: "text-emerald-600 bg-emerald-50 border-emerald-100",
                  },
                  {
                    label: "Admissions",
                    value: admissions.length,
                    icon: Stethoscope,
                    cls: "text-rose-600 bg-rose-50 border-rose-100",
                  },
                  {
                    label: "Follow-Ups",
                    value: followUps.length,
                    icon: UserCheck,
                    cls: "text-indigo-600 bg-indigo-50 border-indigo-100",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-white border border-gray-200 rounded-2xl p-4"
                  >
                    <span
                      className={`inline-flex p-2 rounded-xl border ${s.cls}`}
                    >
                      <s.icon className="h-4 w-4" />
                    </span>
                    <p className="mt-2 text-2xl font-black text-gray-900">
                      {s.value}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h2 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-blue-600" /> Current
                    Appointment Details
                  </h2>
                  {selectedAppointment ? (
                    <div className="space-y-3 text-sm">
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <p className="text-xs text-gray-500 font-bold uppercase">
                          Appointment ID
                        </p>
                        <p className="font-semibold text-gray-800">
                          {selectedAppointment.data?.id || "N/A"}
                        </p>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <p className="text-xs text-gray-500 font-bold uppercase">
                          Appointment Date
                        </p>
                        <p className="font-semibold text-gray-800">
                          {fmtDateTime(selectedAppointment.date)}
                        </p>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <p className="text-xs text-gray-500 font-bold uppercase">
                          Appointment Form Filled On
                        </p>
                        <p className="font-semibold text-gray-800">
                          {fmtDateTime(patient.created_at)}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                          <p className="text-xs text-gray-500 font-bold uppercase">
                            Doctor
                          </p>
                          <p className="font-semibold text-gray-800">
                            {selectedAppointment.data?.doctor || "N/A"}
                          </p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                          <p className="text-xs text-gray-500 font-bold uppercase">
                            Status
                          </p>
                          <p className="font-semibold text-gray-800">
                            {selectedAppointment.data?.status || "N/A"}
                          </p>
                        </div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <p className="text-xs text-gray-500 font-bold uppercase">
                          Reason For Visit
                        </p>
                        <p className="font-semibold text-gray-800">
                          {selectedAppointment.data?.reason || "N/A"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 font-medium">
                      No appointment details available.
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h2 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
                    <HeartPulse className="h-5 w-5 text-rose-600" /> Latest
                    Vitals
                  </h2>
                  {vitals.length === 0 ? (
                    <div className="text-sm text-gray-500 font-medium">
                      No vitals recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {vitals.slice(0, 5).map((v: any, i: number) => (
                        <div
                          key={i}
                          className="bg-gray-50 border border-gray-200 rounded-xl p-3"
                        >
                          <p className="text-xs text-gray-500 font-bold mb-1">
                            {fmtDateTime(v.created_at)}
                          </p>
                          <p className="text-sm text-gray-800">
                            BP: {v.blood_pressure || "N/A"} | HR:{" "}
                            {v.heart_rate || "N/A"} | Temp:{" "}
                            {v.temperature || "N/A"} | SpO2: {v.spo2 || "N/A"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h2 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-violet-600" /> Medical
                  Timeline
                </h2>
                {timeline.length === 0 ? (
                  <div className="text-sm text-gray-500 font-medium">
                    No timeline events available.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {timeline.slice(0, 20).map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:border-violet-300 transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          {(() => {
                            const meta = getEventMeta(item);
                            const statusBadge = getStatusBadge(
                              item?.data?.status,
                            );
                            const MetaIcon = meta.icon;
                            const StatusIcon = statusBadge?.icon;
                            return (
                              <>
                                <span
                                  className={`text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border inline-flex items-center gap-1.5 ${meta.style}`}
                                >
                                  <MetaIcon className="h-3.5 w-3.5" />{" "}
                                  {meta.label}
                                </span>
                                <div className="flex items-center gap-2">
                                  {statusBadge && StatusIcon && (
                                    <span
                                      className={`text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg border inline-flex items-center gap-1 ${statusBadge.cls}`}
                                    >
                                      <StatusIcon className="h-3 w-3" />{" "}
                                      {item.data?.status}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500 font-semibold flex items-center gap-1">
                                    <Clock className="h-3 w-3" />{" "}
                                    {fmtDateTime(item.date)} (
                                    {relativeTime(item.date)})
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        {renderEventDetails(item)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {ipdAdmissions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                  <h2 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-rose-600" /> IPD Journey
                  </h2>
                  <IPDJourneyTab admissions={ipdAdmissions} />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
