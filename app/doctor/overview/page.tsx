"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/app/components/layout/Sidebar";
import { getPatientQueue } from "@/app/actions/doctor-actions";
import { Activity, CalendarDays, Clock3, Search, Users } from "lucide-react";

interface DoctorSession {
  id: string;
  username: string;
  role: string;
  name?: string;
  specialty?: string;
  organization_name?: string;
}

interface QueuePatient {
  patient_id: string;
  digital_id?: string;
  full_name: string;
  age?: number;
  gender?: string;
  phone?: string;
  department?: string;
  status?: string;
  appointment_id?: string;
  appointment_date?: string;
}

const cardStyle =
  "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-gray-100/60";

export default function DoctorOverviewDashboard() {
  const [session, setSession] = useState<DoctorSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<QueuePatient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [comingDate, setComingDate] = useState("");
  const [sortBy, setSortBy] = useState<
    "date_desc" | "date_asc" | "name_asc" | "name_desc" | "age_asc" | "age_desc"
  >("date_desc");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const sessionRes = await fetch("/api/session");
        if (!sessionRes.ok) {
          setLoading(false);
          return;
        }

        const sessionData = (await sessionRes.json()) as DoctorSession;
        setSession(sessionData);

        const queueRes = await getPatientQueue({
          doctor_id: sessionData.id,
          doctor_name: sessionData.name,
          doctor_username: sessionData.username,
          view: "my",
          dateRange: "all",
          includeAllStatuses: true,
        });

        if (queueRes.success) {
          setPatients((queueRes.data as QueuePatient[]) || []);
        } else {
          setPatients([]);
        }
      } catch (error) {
        console.error("Failed to load doctor dashboard", error);
        setPatients([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const todayStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const upcomingPatients = useMemo(
    () =>
      patients.filter(
        (patient) =>
          patient.appointment_date &&
          new Date(patient.appointment_date) >= todayStart,
      ),
    [patients, todayStart],
  );

  const previousPatients = useMemo(
    () =>
      patients.filter(
        (patient) =>
          patient.appointment_date &&
          new Date(patient.appointment_date) < todayStart,
      ),
    [patients, todayStart],
  );

  const dateWisePatients = useMemo(() => {
    if (!comingDate) return patients.length;

    return patients.filter((patient) => {
      if (!patient.appointment_date) return false;
      return (
        new Date(patient.appointment_date).toISOString().slice(0, 10) ===
        comingDate
      );
    }).length;
  }, [comingDate, patients]);

  const filteredPatients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return patients.filter((patient) => {
      const matchesSearch =
        !normalizedSearch ||
        patient.full_name?.toLowerCase().includes(normalizedSearch) ||
        patient.patient_id?.toLowerCase().includes(normalizedSearch) ||
        patient.digital_id?.toLowerCase().includes(normalizedSearch) ||
        patient.phone?.toLowerCase().includes(normalizedSearch);

      const matchesDate =
        !comingDate ||
        (patient.appointment_date &&
          new Date(patient.appointment_date).toISOString().slice(0, 10) ===
            comingDate);

      return matchesSearch && matchesDate;
    });
  }, [patients, searchTerm, comingDate]);

  const sortedPatients = useMemo(() => {
    const list = [...filteredPatients];

    list.sort((a, b) => {
      if (sortBy === "name_asc") {
        return (a.full_name || "").localeCompare(b.full_name || "", "en", {
          sensitivity: "base",
        });
      }

      if (sortBy === "name_desc") {
        return (b.full_name || "").localeCompare(a.full_name || "", "en", {
          sensitivity: "base",
        });
      }

      if (sortBy === "age_asc") {
        return (
          (a.age ?? Number.MAX_SAFE_INTEGER) -
          (b.age ?? Number.MAX_SAFE_INTEGER)
        );
      }

      if (sortBy === "age_desc") {
        return (b.age ?? -1) - (a.age ?? -1);
      }

      const aDate = a.appointment_date
        ? new Date(a.appointment_date).getTime()
        : Number.NEGATIVE_INFINITY;
      const bDate = b.appointment_date
        ? new Date(b.appointment_date).getTime()
        : Number.NEGATIVE_INFINITY;

      if (sortBy === "date_asc") {
        return aDate - bDate;
      }

      return bDate - aDate;
    });

    return list;
  }, [filteredPatients, sortBy]);

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden relative">
      <Sidebar session={session} />

      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto w-full space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white px-5 py-6 sm:px-6 shadow-sm">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900">
              Doctor Dashboard
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Track all your patients, consultation history, date-wise
              appointments, and booking times.
            </p>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <article className={cardStyle}>
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                Total Consultations
              </p>
              <div className="mt-3 flex items-center justify-between">
                <h2 className="text-3xl font-black text-teal-600">
                  {patients.length}
                </h2>
                <Activity className="h-6 w-6 text-teal-500" />
              </div>
            </article>

            <article className={cardStyle}>
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                Previous Patients
              </p>
              <div className="mt-3 flex items-center justify-between">
                <h2 className="text-3xl font-black text-blue-600">
                  {previousPatients.length}
                </h2>
                <Users className="h-6 w-6 text-blue-500" />
              </div>
            </article>

            <article className={cardStyle}>
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                Date-wise Patients{" "}
                <span className="text-gray-400 font-normal normal-case">
                  (This is filtered by the selected date in Search by
                  Appointment Booking Date.)
                </span>
              </p>
              <div className="mt-3 flex items-center justify-between">
                <h2 className="text-3xl font-black text-emerald-600">
                  {dateWisePatients}
                </h2>
                <CalendarDays className="h-6 w-6 text-emerald-500" />
              </div>
            </article>

            <article className={cardStyle}>
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                Coming Appointments
              </p>
              <div className="mt-3 flex items-center justify-between">
                <h2 className="text-3xl font-black text-violet-600">
                  {upcomingPatients.length}
                </h2>
                <Clock3 className="h-6 w-6 text-violet-500" />
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-6 relative min-w-0">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by patient name, ID, digital ID, or phone"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Search by Appointment Booking Date
                </label>
                <input
                  type="date"
                  value={comingDate}
                  onChange={(event) => setComingDate(event.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Sort Patients
                </label>
                <select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as typeof sortBy)
                  }
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                >
                  <option value="date_desc">Date: Newest First</option>
                  <option value="date_asc">Date: Oldest First</option>
                  <option value="name_asc">Name: A to Z</option>
                  <option value="name_desc">Name: Z to A</option>
                  <option value="age_asc">Age: Low to High</option>
                  <option value="age_desc">Age: High to Low</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold">Patient</th>
                    <th className="text-left px-4 py-3 font-bold">
                      Patient ID
                    </th>
                    <th className="text-left px-4 py-3 font-bold">
                      Age/Gender
                    </th>
                    <th className="text-left px-4 py-3 font-bold">Status</th>
                    <th className="text-left px-4 py-3 font-bold">
                      Appointment Date
                    </th>
                    <th className="text-left px-4 py-3 font-bold">
                      Booking Slot
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        className="px-4 py-8 text-center text-gray-500"
                        colSpan={6}
                      >
                        Loading patients...
                      </td>
                    </tr>
                  ) : sortedPatients.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-8 text-center text-gray-500"
                        colSpan={6}
                      >
                        No patient records found for selected filters.
                      </td>
                    </tr>
                  ) : (
                    sortedPatients.map((patient) => {
                      const appointmentDate = patient.appointment_date
                        ? new Date(patient.appointment_date)
                        : null;

                      return (
                        <tr
                          key={`${patient.appointment_id || patient.patient_id}-${patient.patient_id}`}
                          className="border-t border-gray-100 hover:bg-gray-50/80"
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900">
                              {patient.full_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {patient.department || "General"}
                            </p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-700">
                            {patient.digital_id || patient.patient_id}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {patient.age ? `${patient.age}y` : "-"}
                            {patient.gender ? ` / ${patient.gender}` : ""}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                              {patient.status || "Pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {appointmentDate
                              ? appointmentDate.toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-gray-700 font-medium">
                            {appointmentDate
                              ? appointmentDate.toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
