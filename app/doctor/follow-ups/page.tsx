"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/app/components/layout/Sidebar";
import PillReminderModal from "@/app/components/doctor/PillReminderModal";
import FollowUpModal from "@/app/components/doctor/FollowUpModal";
import {
  Calendar,
  Phone,
  CheckCircle2,
  Search,
  Filter,
  MessageSquare,
  AlertCircle,
  Clock,
  User,
  Loader2,
  Check,
  Pill,
  Bell,
  Trash2,
  Users,
} from "lucide-react";
import {
  getFollowUpsDue,
  updateFollowUpStatus,
} from "@/app/actions/doctor-actions";
import { 
  getActivePillReminders, 
  deactivatePillReminder,
  searchPatients 
} from "@/app/actions/pill-actions";
import { format } from "date-fns";
import { toast } from "react-hot-toast";

type FilterType = "today" | "week" | "overdue" | "all";
type ViewTab = "clinical" | "pills";

interface FollowUpItem {
  id: string;
  patient_id: string;
  doctor_id: string;
  scheduled_date: string;
  notes?: string;
  status: string;
  patientName: string;
  patientPhone?: string | null;
}

export default function DoctorFollowUps() {
  const [session, setSession] = useState<{
    id: string;
    username: string;
    role: string;
    name?: string;
    specialty?: string;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [pillReminders, setPillReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState<ViewTab>("clinical");
  const [markingDone, setMarkingDone] = useState<string | null>(null);
  const [isPillModalOpen, setIsPillModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          setSession(data);
        }
      } catch (e) {
        console.error("Failed to fetch session", e);
      }
    }
    fetchSession();
  }, []);

  const fetchData = useCallback(async () => {
    if (!session?.id) return;
    setLoading(true);
    try {
      const [fuRes, prRes] = await Promise.all([
        getFollowUpsDue(session.id, "all"),
        getActivePillReminders()
      ]);

      if (fuRes.success && fuRes.data) {
        setFollowUps(fuRes.data as FollowUpItem[]);
      }
      if (prRes.success && prRes.data) {
        setPillReminders(prRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  }, [session?.id]);

  useEffect(() => {
    if (session?.id) {
      fetchData();
    }
  }, [session?.id, fetchData]);

  async function handleMarkDone(id: string) {
    setMarkingDone(id);
    try {
      const result = await updateFollowUpStatus(id, "Completed");
      if (result.success) {
        toast.success("Follow-up marked as completed");
        await fetchData();
      }
    } catch (error) {
      console.error("Failed to mark follow-up as done", error);
    } finally {
      setMarkingDone(null);
    }
  }

  async function handleDeactivateReminder(id: string) {
    if (!confirm("Are you sure you want to deactivate this reminder?")) return;
    try {
      const res = await deactivatePillReminder(id);
      if (res.success) {
        toast.success("Reminder deactivated");
        await fetchData();
      }
    } catch (error) {
      console.error("Failed to deactivate", error);
    }
  }

  // Formatting helper
  function formatDate(dateStr: string): string {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy, hh:mm aa");
    } catch {
      return "--";
    }
  }

  const filteredFollowUps = followUps.filter((f) => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const scheduled = new Date(f.scheduled_date);

    const matchesFilter =
      activeFilter === "all"
        ? true
        : activeFilter === "today"
          ? f.status === "Pending" &&
            scheduled >= todayStart &&
            scheduled <= todayEnd
          : activeFilter === "week"
            ? f.status === "Pending" &&
              scheduled >= todayStart &&
              scheduled <= weekEnd
            : f.status === "Pending" && scheduled < todayStart;

    if (!matchesFilter) return false;

    const name = (f.patientName || "").toLowerCase();
    const notes = (f.notes || "").toLowerCase();
    const term = searchTerm.toLowerCase();
    return name.includes(term) || notes.includes(term);
  });

  const filteredPills = pillReminders.filter(p => 
    p.medication_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.patient?.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filterTabs: { key: FilterType; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "overdue", label: "Overdue" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden relative">
      <Sidebar session={session} />

      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto w-full space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 border border-amber-200 bg-amber-50/50 rounded-xl shadow-sm">
                  {activeTab === 'clinical' ? <Phone className="h-6 w-6 text-amber-500" /> : <Pill className="h-6 w-6 text-amber-500" />}
                </div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                  Follow-Ups Manager
                </h1>
              </div>
              <p className="text-sm text-gray-500 font-medium">
                Track and manage scheduled patient follow-ups and medication adherence.
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsFollowUpModalOpen(true)}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-amber-500/30 transition-all flex items-center gap-2 shadow-sm text-sm whitespace-nowrap active:scale-95"
              >
                <Calendar className="h-4 w-4" /> Schedule Follow-up
              </button>
              <button 
                onClick={() => setIsPillModalOpen(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-400 hover:to-orange-400 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 text-sm whitespace-nowrap active:scale-95"
              >
                <Pill className="h-4 w-4" /> Schedule Pill Reminder
              </button>
            </div>
          </div>

          {/* View Toggles */}
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm w-full md:w-auto">
              <button
                onClick={() => setActiveTab('clinical')}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'clinical' ? 'bg-amber-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <Users className="w-4 h-4" />
                Clinical Follow-ups
              </button>
              <button
                onClick={() => setActiveTab('pills')}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'pills' ? 'bg-amber-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <Bell className="w-4 h-4" />
                Pill Reminders
              </button>
            </div>

            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-amber-500 transition-colors" />
              <input
                type="text"
                placeholder={activeTab === 'clinical' ? "Search patient or reason..." : "Search medication or patient..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all shadow-sm font-medium"
              />
            </div>
          </div>

          {activeTab === 'clinical' ? (
            <div className="space-y-6">
              {/* Clinical Filter Tabs */}
              <div className="flex gap-2 flex-wrap">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={`px-4 py-2 text-sm font-bold rounded-xl border transition-all ${
                      activeFilter === tab.key
                        ? "bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20"
                        : "bg-white text-gray-600 border-gray-200 hover:border-amber-500/30 hover:bg-amber-50/50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Clinical Table */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
                {loading ? (
                  <div className="flex items-center justify-center py-20 text-gray-400">
                    <Loader2 className="h-8 w-8 animate-spin mr-3" />
                  </div>
                ) : filteredFollowUps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <Calendar className="h-12 w-12 mb-3 text-gray-200" />
                    <p className="font-bold">No clinical follow-ups found.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredFollowUps.map((item) => (
                      <div key={item.id} className="p-5 hover:bg-amber-50/50 transition-all group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                        <div className="hidden sm:flex h-12 w-12 bg-amber-100 rounded-2xl items-center justify-center flex-shrink-0">
                          <User className="h-6 w-6 text-amber-600" />
                        </div>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                          <div>
                            <p className="font-bold text-gray-900">{item.patientName}</p>
                            <p className="text-xs text-gray-400 mt-1">ID: {item.patient_id}</p>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 text-amber-500" />
                              {formatDate(item.scheduled_date)}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{item.notes || "No additional notes"}</p>
                          </div>
                          <div className="flex items-center sm:justify-end gap-2">
                             {item.status !== 'Completed' ? (
                               <button 
                                onClick={() => handleMarkDone(item.id)}
                                disabled={markingDone === item.id}
                                className="px-4 py-2 bg-emerald-500/10 text-emerald-600 font-bold text-xs rounded-xl hover:bg-emerald-500/20 border border-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                               >
                                 {markingDone === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                 Mark Done
                               </button>
                             ) : (
                               <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold border border-emerald-100">Completed</span>
                             )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse"></div>)
              ) : filteredPills.length === 0 ? (
                <div className="col-span-full py-20 bg-white border border-gray-200 rounded-2xl text-center">
                  <Pill className="h-12 w-12 mx-auto mb-3 text-gray-200" />
                  <p className="text-gray-500 font-medium">No active pill reminders found.</p>
                </div>
              ) : (
                filteredPills.map((p) => (
                  <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-3 bg-amber-50 rounded-xl">
                        <Pill className="w-6 h-6 text-amber-500" />
                      </div>
                      <button 
                       onClick={() => handleDeactivateReminder(p.id)}
                       className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-gray-900">{p.medication_name}</h3>
                      <p className="text-sm font-medium text-gray-500">{p.dosage}</p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-50 space-y-3">
                       <div className="flex items-center gap-2 text-sm text-gray-700">
                         <User className="w-4 h-4 text-gray-400" />
                         <span className="font-bold">{p.patient?.full_name}</span>
                       </div>
                       <div className="flex items-center gap-2 text-sm">
                         <Clock className="w-4 h-4 text-amber-500" />
                         <div className="flex flex-wrap gap-1">
                           {p.schedule_times.map((t: string) => (
                             <span key={t} className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-bold text-[10px] tracking-tight">{t}</span>
                           ))}
                         </div>
                       </div>
                       <div className="flex items-center gap-2 text-xs text-gray-500">
                         <Calendar className="w-4 h-4" />
                         <span>{format(new Date(p.start_date), 'MMM dd')} - {format(new Date(p.end_date), 'MMM dd')}</span>
                       </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      <PillReminderModal 
        isOpen={isPillModalOpen}
        onClose={() => {
          setIsPillModalOpen(false);
          fetchData();
        }}
        patients={patients}
        session={session}
      />

      <FollowUpModal 
        isOpen={isFollowUpModalOpen}
        onClose={() => {
          setIsFollowUpModalOpen(false);
          fetchData();
        }}
        session={session}
      />
    </div>
  );
}
