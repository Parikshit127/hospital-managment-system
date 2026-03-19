"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  UserRound,
  Phone,
  CalendarDays,
  Building2,
  Stethoscope,
} from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getAdminPatientList } from "@/app/actions/admin-actions";

const PAGE_LIMIT = 25;

type DateRange = "today" | "week" | "month" | "all";
type PatientStateFilter =
  | "all"
  | "admitted"
  | "consult"
  | "appointment"
  | "registered";

export default function AdminPatientsPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [patientState, setPatientState] = useState<PatientStateFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminPatientList({
        search,
        department,
        date: selectedDate || undefined,
        dateRange,
        page,
        limit: PAGE_LIMIT,
      });

      if (res.success) {
        setPatients(res.data || []);
        setTotalPages(res.totalPages || 0);
        setTotal(res.total || 0);
      } else {
        setPatients([]);
        setTotalPages(0);
        setTotal(0);
      }
    } catch (error) {
      console.error("Admin patient list load failed:", error);
      setPatients([]);
      setTotalPages(0);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, department, selectedDate, dateRange, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filteredPatients = useMemo(() => {
    return patients.filter((patient: any) => {
      if (patientState === "admitted" && patient.patientState !== "Admitted")
        return false;
      if (patientState === "consult" && patient.patientState !== "In Consult")
        return false;
      if (
        patientState === "appointment" &&
        patient.patientState !== "Appointment"
      )
        return false;
      if (
        patientState === "registered" &&
        patient.patientState !== "Registered"
      )
        return false;

      return true;
    });
  }, [patients, patientState]);

  const stateBadgeClass = (state: string) => {
    if (state === "Admitted")
      return "bg-rose-50 text-rose-700 border border-rose-200";
    if (state === "In Consult")
      return "bg-violet-50 text-violet-700 border border-violet-200";
    if (state === "Appointment")
      return "bg-blue-50 text-blue-700 border border-blue-200";
    return "bg-gray-50 text-gray-700 border border-gray-200";
  };

  const headerActions = (
    <div className="text-xs font-bold text-gray-500">
      Total Patients: <span className="text-gray-900">{total}</span>
    </div>
  );

  return (
    <AppShell
      pageTitle="Patient List"
      pageIcon={<Users className="h-5 w-5" />}
      headerActions={headerActions}
      onRefresh={loadData}
      refreshing={loading}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="relative lg:col-span-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, ID, or phone..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
              >
                <option value="">All Departments</option>
                <option value="General Medicine">General Medicine</option>
                <option value="Cardiology">Cardiology</option>
                <option value="Orthopedics">Orthopedics</option>
                <option value="Pediatrics">Pediatrics</option>
                <option value="Neurology">Neurology</option>
                <option value="ENT">ENT</option>
                <option value="Dermatology">Dermatology</option>
                <option value="Pulmonology">Pulmonology</option>
              </select>
            </div>

            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value as DateRange);
                setPage(1);
              }}
              className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
            >
              <option value="all">All Time</option>
              "Date",
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
            />

            <select
              value={patientState}
              onChange={(e) =>
                setPatientState(e.target.value as PatientStateFilter)
              }
              className="px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
            >
              <option value="all">All Status</option>
              <option value="admitted">Admitted</option>
              <option value="consult">In Consult</option>
              <option value="appointment">Appointment</option>
              <option value="registered">Only Registered</option>
            </select>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {[
                    "Patient",
                    "Department",
                    "Contact",
                    "Registration",
                    "Assigned Doctor",
                    "Current Stage",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && patients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-teal-500 mx-auto" />
                      <p className="text-gray-400 text-xs mt-2">
                        Loading patient list...
                      </p>
                    </td>
                  </tr>
                ) : filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-medium">
                        No patients match current filters
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((patient: any) => {
                    const detailHref = patient.latestAppointmentId
                      ? `/admin/patients/${patient.patient_id}?appointmentId=${encodeURIComponent(patient.latestAppointmentId)}`
                      : `/admin/patients/${patient.patient_id}`;
                    const dateValue =
                      patient.activeAdmissionDate ||
                      patient.latestAppointmentDate ||
                      patient.created_at;
                    const dateLabel = patient.activeAdmissionDate
                      ? "Admitted Date"
                      : patient.latestAppointmentDate
                        ? "Appointment Date"
                        : "Form Filled Date";

                    return (
                      <tr
                        key={patient.patient_id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <span className="p-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
                              <UserRound className="h-4 w-4" />
                            </span>
                            <div>
                              <Link
                                href={detailHref}
                                className="font-semibold text-gray-900 hover:text-teal-700 hover:underline"
                              >
                                {patient.full_name}
                              </Link>
                              <p className="text-xs text-gray-500">
                                {patient.patient_id}
                              </p>
                              <p className="text-xs text-gray-400">
                                {patient.age || "-"} / {patient.gender || "-"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-gray-400" />
                            <span>{patient.department || "General"}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-gray-600">
                          {patient.phone ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-gray-400" />
                              {patient.phone}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {new Date(dateValue).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {dateLabel}
                            </p>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-gray-700">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-gray-800">
                              {patient.assignedDoctor || "Unassigned"}
                            </p>
                            {!patient.assignedDoctor && (
                              <p className="text-[11px] text-gray-400">
                                No doctor assigned yet
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${stateBadgeClass(patient.patientState)}`}
                            >
                              {patient.patientState}
                            </span>
                            {patient.latestAppointmentStatus && (
                              <p className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                                <Stethoscope className="h-3 w-3" />
                                {patient.latestAppointmentStatus}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <span className="text-xs text-gray-400">
                Showing {(page - 1) * PAGE_LIMIT + 1} -{" "}
                {Math.min(page * PAGE_LIMIT, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 text-gray-400" />
                </button>
                <span className="text-xs font-medium text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
