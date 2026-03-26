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
  BedDouble,
  UserPlus,
  Droplets,
} from "lucide-react";
import { AppShell } from "@/app/components/layout/AppShell";
import {
  getAdminPatientList,
  getAdminPatientStats,
  getDepartments,
} from "@/app/actions/admin-actions";

const PAGE_LIMIT = 25;

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

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
  const [bloodGroup, setBloodGroup] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [patientState, setPatientState] = useState<PatientStateFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const [departments, setDepartments] = useState<any[]>([]);
  const [stats, setStats] = useState<{
    totalPatients: number;
    admittedNow: number;
    appointmentsToday: number;
    newThisMonth: number;
  } | null>(null);

  // Load departments and stats once on mount
  useEffect(() => {
    async function loadMeta() {
      const [deptRes, statsRes] = await Promise.all([
        getDepartments(),
        getAdminPatientStats(),
      ]);
      if (deptRes.success && deptRes.data) setDepartments(deptRes.data);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
    }
    loadMeta();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminPatientList({
        search,
        department,
        bloodGroup: bloodGroup || undefined,
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
  }, [search, department, bloodGroup, selectedDate, dateRange, page]);

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

  const statCards = [
    {
      label: "Total Patients",
      value: stats?.totalPatients ?? "-",
      icon: Users,
      cls: "text-teal-600 bg-teal-50 border-teal-100",
    },
    {
      label: "Currently Admitted",
      value: stats?.admittedNow ?? "-",
      icon: BedDouble,
      cls: "text-rose-600 bg-rose-50 border-rose-100",
    },
    {
      label: "Today's Appointments",
      value: stats?.appointmentsToday ?? "-",
      icon: CalendarDays,
      cls: "text-blue-600 bg-blue-50 border-blue-100",
    },
    {
      label: "New This Month",
      value: stats?.newThisMonth ?? "-",
      icon: UserPlus,
      cls: "text-emerald-600 bg-emerald-50 border-emerald-100",
    },
  ];

  return (
    <AppShell
      pageTitle="Patient List"
      pageIcon={<Users className="h-5 w-5" />}
      headerActions={headerActions}
      onRefresh={loadData}
      refreshing={loading}
    >
      <div className="space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((s) => (
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

        {/* Filters */}
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

          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
                {departments.map((d: any) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Droplets className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={bloodGroup}
                onChange={(e) => {
                  setBloodGroup(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-teal-500"
              >
                <option value="">All Blood Groups</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
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
              <option value="today">Today</option>
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

        {/* Table */}
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
                    const detailHref = `/admin/patients/${patient.patient_id}`;
                    const dateValue =
                      patient.activeAdmissionDate ||
                      patient.latestAppointmentDate ||
                      patient.created_at;
                    const dateLabel = patient.activeAdmissionDate
                      ? "Admitted Date"
                      : patient.latestAppointmentDate
                        ? "Appointment Date"
                        : "Registration Date";

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
                                {patient.blood_group && (
                                  <span className="ml-1.5 text-rose-500 font-semibold">
                                    {patient.blood_group}
                                  </span>
                                )}
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
