"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Plus,
  X,
  FileText,
  Activity,
  Clock,
  Stethoscope,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Pill,
  History,
  User,
  Clipboard,
  Printer,
  RefreshCw,
  HeartPulse,
  Brain,
  Shield,
  Thermometer,
  Heart,
  Wind,
  Zap,
} from "lucide-react";
import {
  getPatientQueue,
  saveClinicalNotes,
  orderLabTest,
  updateAppointmentStatus,
  admitPatient,
  getPatientHistory,
  getPatientLabOrders,
  getMedicineList,
  createPharmacyOrder,
  saveMedicalNote,
  scheduleFollowUp,
  getPatientFollowUps,
} from "@/app/actions/doctor-actions";
import { getWardsWithBeds } from "@/app/actions/ipd-actions";
import { dischargePatient } from "@/app/actions/discharge-actions";
import { registerPatient } from "@/app/actions/register-patient";
import { getPatientTriageData } from "@/app/actions/triage-actions";
import {
    getPendingCallRequests,
    respondToVideoCall,
    getAllCallRequests,
} from "@/app/actions/video-call-actions";
import { Sidebar } from "@/app/components/layout/Sidebar";
import SOAPAssistant from "@/app/doctor/components/SOAPAssistant";
import { Video } from "lucide-react";
import IPDJourneyTab from "@/app/admin/patients/[patientId]/tabs/IPDJourneyTab";
import { PatientSummaryBar } from "@/app/components/clinical/PatientSummaryBar";
import { SOAPNoteForm } from "@/app/components/clinical/SOAPNoteForm";
import { getOrCreateEncounterForAppointment } from "@/app/actions/emr-actions";
import { TemplatePicker } from "@/app/components/clinical/TemplatePicker";
import { PrescriptionPrint, type PrescriptionData } from "@/app/components/clinical/PrescriptionPrint";

export default function DoctorDashboard() {
  // ─── SESSION STATE ───
  const [session, setSession] = useState<{
    id: string;
    username: string;
    role: string;
    name?: string;
    specialty?: string;
  } | null>(null);
  const [doctorName, setDoctorName] = useState("Doctor");
  const [doctorId, setDoctorId] = useState("");
  const [doctorSpecialty, setDoctorSpecialty] = useState("");
  const [sessionResolved, setSessionResolved] = useState(false);

  // ─── VIEW MODE ───
  const viewMode: "my" = "my";
  const [queueDateRange, setQueueDateRange] = useState<"upcoming" | "all">(
    "upcoming",
  );

  const [queue, setQueue] = useState<any[]>([]);
  const [activePatient, setActivePatient] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    "notes" | "history" | "lab" | "pharmacy" | "triage" | "followup" | "video-calls"
  >("triage");
  const [triageData, setTriageData] = useState<any>(null);
  const [loadingTriage, setLoadingTriage] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState(""); // Legacy fallback

  // ─── SOAP NOTES STATE ───
  const [soapS, setSoapS] = useState(""); // Subjective
  const [soapO, setSoapO] = useState(""); // Objective
  const [soapA, setSoapA] = useState(""); // Assessment
  const [soapP, setSoapP] = useState(""); // Plan
  const [encounterId, setEncounterId] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showPrescriptionPrint, setShowPrescriptionPrint] = useState(false);
  const [prescriptionData, setPrescriptionData] = useState<PrescriptionData | null>(null);

  const [selectedTest, setSelectedTest] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [ipdAdmissions, setIpdAdmissions] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [loadingLabs, setLoadingLabs] = useState(false);
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [admitDiagnosis, setAdmitDiagnosis] = useState("");
  const [admitWards, setAdmitWards] = useState<any[]>([]);
  const [admitSelectedWard, setAdmitSelectedWard] = useState("");
  const [admitSelectedBed, setAdmitSelectedBed] = useState("");
  const [admitAvailableBeds, setAdmitAvailableBeds] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState("");
  const [medicineQty, setMedicineQty] = useState(1);
  const [pharmacyCart, setPharmacyCart] = useState<any[]>([]);
  const [pharmacyOrderResult, setPharmacyOrderResult] = useState<any>(null);
  const [showWalkinModal, setShowWalkinModal] = useState(false);
  const [walkinFormData, setWalkinFormData] = useState({
    full_name: "",
    phone: "",
    age: "",
    gender: "Male",
    address: "",
    department: "General",
  });
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [medicalNoteType, setMedicalNoteType] = useState("Routine Check");
  const [medicalNoteDetails, setMedicalNoteDetails] = useState("");
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [dischargePdfUrl, setDischargePdfUrl] = useState("");
  const [isDischarging, setIsDischarging] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [patientFollowUps, setPatientFollowUps] = useState<any[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);

  // ─── VIDEO CALL STATE ───
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedVideoRequest, setSelectedVideoRequest] = useState<any>(null);
  const [videoScheduleTime, setVideoScheduleTime] = useState("");
  const [videoRejectionReason, setVideoRejectionReason] = useState("");
  const [videoMeetLink, setVideoMeetLink] = useState("");
  const [allVideoRequests, setAllVideoRequests] = useState<any[]>([]);
  const [loadingVideoRequests, setLoadingVideoRequests] = useState(false);

  const refreshVideoRequests = useCallback(async () => {
    if (!doctorId) return;
    const res = await getPendingCallRequests(doctorId);
    if (res.success) setPendingRequests(res.data);
    
    // Also refresh all requests history
    setLoadingVideoRequests(true);
    const resAll = await getAllCallRequests(doctorId);
    if (resAll.success) setAllVideoRequests(resAll.data);
    setLoadingVideoRequests(false);
  }, [doctorId]);

  const handleVideoResponse = async (status: "Accepted" | "Rejected") => {
    if (!selectedVideoRequest || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await respondToVideoCall({
        requestId: selectedVideoRequest.id,
        status,
        scheduledAt: status === "Accepted" ? videoScheduleTime : undefined,
        rejectionReason: status === "Rejected" ? videoRejectionReason : undefined,
        meetLink: status === "Accepted" ? videoMeetLink : undefined,
      });
      if (res.success) {
        alert(`Call ${status.toLowerCase()} successfully!`);
        setShowVideoModal(false);
        refreshVideoRequests();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── FETCH SESSION ───
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          setSession(data);
          setDoctorName(data.name || data.username || "Doctor");
          setDoctorId(data.id || "");
          setDoctorSpecialty(data.specialty || "");
        }
      } catch (e) {
        console.error("Failed to fetch session", e);
      } finally {
        setSessionResolved(true);
      }
    }
    fetchSession();
  }, []);

  // ─── REFRESH QUEUE ───
  const refreshQueue = useCallback(async () => {
    if (!sessionResolved || !session) return;
    if (
      viewMode === "my" &&
      !doctorId &&
      !session?.name &&
      !session?.username
    ) {
      setQueue([]);
      return;
    }

    try {
      const queueRes = await getPatientQueue({
        doctor_id: doctorId,
        doctor_name: session?.name,
        doctor_username: session?.username,
        view: viewMode,
        specialty: undefined,
        dateRange: queueDateRange,
        includeAllStatuses: true,
      });
      if (queueRes.success) {
        setQueue(queueRes.data as any);
      }
    } catch (e) {
      console.error("Failed to refresh queue", e);
    }
  }, [
    doctorId,
    queueDateRange,
    session,
    sessionResolved,
    session?.name,
    session?.username,
  ]);

  // ─── INITIAL LOAD ───
  useEffect(() => {
    if (!sessionResolved || !session) return;

    async function init() {
      if (
        viewMode === "my" &&
        !doctorId &&
        !session?.name &&
        !session?.username
      ) {
        setQueue([]);
        setLoading(false);
        return;
      }

      try {
        const [queueRes, medsRes, vRes] = await Promise.all([
          getPatientQueue({
            doctor_id: doctorId,
            doctor_name: session?.name,
            doctor_username: session?.username,
            view: viewMode,
            specialty: undefined,
            dateRange: queueDateRange,
            includeAllStatuses: true,
          }),
          getMedicineList(),
          getPendingCallRequests(doctorId),
        ]);
        if (queueRes.success) {
          setQueue(queueRes.data as any);
          if (queueRes.data.length > 0)
            setActivePatient(queueRes.data[0] as any);
        }
        if (medsRes.success) setMedicines(medsRes.data as any);
        if (vRes.success) setPendingRequests(vRes.data);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [
    doctorId,
    queueDateRange,
    session,
    sessionResolved,
    session?.name,
    session?.username,
  ]);

  // ─── AUTO-REFRESH EVERY 60s ───
  useEffect(() => {
    const interval = setInterval(refreshQueue, 60000);
    return () => clearInterval(interval);
  }, [queueDateRange, refreshQueue]);

  useEffect(() => {
    if (activePatient && activeTab === "history") {
      async function loadHistory() {
        setLoadingHistory(true);
        const res = await getPatientHistory(activePatient!.patient_id);
        if (res.success) setHistory(res.data as any);
        const { getAdminPatientFullDetails } = await import("@/app/actions/admin-actions");
        const admRes = await getAdminPatientFullDetails(activePatient!.patient_id);
        if (admRes.success) setIpdAdmissions(admRes.data?.admissions || []);
        setLoadingHistory(false);
      }
      loadHistory();
    }
  }, [activePatient, activeTab]);

  useEffect(() => {
    if (activePatient && activeTab === "triage") {
      async function loadTriage() {
        setLoadingTriage(true);
        const res = await getPatientTriageData(activePatient!.patient_id);
        if (res.success) setTriageData(res.data);
        setLoadingTriage(false);
      }
      loadTriage();
    }
  }, [activePatient, activeTab]);

  useEffect(() => {
    if (activePatient && activeTab === "lab") {
      fetchLabs(activePatient.patient_id);
    }
  }, [activePatient, activeTab]);

  const fetchPatientFollowUps = useCallback(
    async (patientId: string) => {
      setLoadingFollowUps(true);
      try {
        const res = await getPatientFollowUps(
          patientId,
          doctorId || session?.id,
        );
        if (res.success) setPatientFollowUps(res.data as any[]);
        else setPatientFollowUps([]);
      } catch (e) {
        console.error("Failed to fetch patient follow-ups", e);
        setPatientFollowUps([]);
      } finally {
        setLoadingFollowUps(false);
      }
    },
    [doctorId, session?.id],
  );

  useEffect(() => {
    if (activePatient && activeTab === "followup") {
      fetchPatientFollowUps(activePatient.patient_id);
      if (!followUpDate) {
        const nextDay = new Date();
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(10, 0, 0, 0);
        setFollowUpDate(nextDay.toISOString().slice(0, 16));
      }
    }
  }, [activePatient, activeTab, followUpDate, fetchPatientFollowUps]);

  // ─── ENCOUNTER: get-or-create when notes tab opens for OPD patient ───
  useEffect(() => {
    if (activeTab === "notes" && activePatient && activePatient.status !== "Admitted" && doctorId && activePatient.appointment_id) {
      setEncounterId("");
      getOrCreateEncounterForAppointment(activePatient.appointment_id, activePatient.patient_id, doctorId)
        .then(r => { if (r.success) setEncounterId(r.data.id); });
    }
  }, [activeTab, activePatient?.appointment_id, doctorId]);

  async function fetchLabs(patientId: string) {
    setLoadingLabs(true);
    const res = await getPatientLabOrders(patientId);
    if (res.success) setLabOrders(res.data as any);
    setLoadingLabs(false);
  }

  const withSubmission = async (fn: () => Promise<void>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await fn();
    } catch (error) {
      console.error(error);
      alert("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveNotes = () =>
    withSubmission(async () => {
      if (!activePatient?.appointment_id)
        return alert("Error: No Appointment ID.");
      if (activePatient.status === "Admitted") {
        await saveMedicalNote({
          admission_id: "LOOKUP_BY_PATIENT:" + activePatient.patient_id,
          note_type: medicalNoteType,
          details: medicalNoteDetails,
        });
        alert("Medical Note Saved");
        setMedicalNoteDetails("");
      } else {
        // Compile SOAP notes into a structured payload
        const compiledNotes = `[SUBJECTIVE]\n${soapS || "N/A"}\n\n[OBJECTIVE]\n${soapO || "N/A"}\n\n[ASSESSMENT]\n${soapA || "N/A"}\n\n[PLAN]\n${soapP || "N/A"}`;
        // Append legacy notes if they exist (graceful fallback)
        const finalNotes = notes
          ? `${compiledNotes}\n\n[GENERAL_NOTES]\n${notes}`
          : compiledNotes;

        await saveClinicalNotes({
          patient_id: activePatient.patient_id,
          appointment_id: activePatient.appointment_id,
          diagnosis,
          notes: finalNotes,
          doctor: doctorName,
        });

        // Clear the form after successful save
        setSoapS("");
        setSoapO("");
        setSoapA("");
        setSoapP("");
        setNotes("");
        setDiagnosis("");
        alert("Clinical Notes Saved");
      }
    });

  const handleOrderLab = () =>
    withSubmission(async () => {
      if (!activePatient) return;
      await orderLabTest({
        patient_id: activePatient.patient_id,
        test_type: selectedTest,
        doctor_id: doctorId,
      });
      alert(`Ordered ${selectedTest}`);
      fetchLabs(activePatient.patient_id);
    });

  const handleOpenAdmitModal = async () => {
    setAdmitDiagnosis("");
    setAdmitSelectedWard("");
    setAdmitSelectedBed("");
    setAdmitAvailableBeds([]);
    const res = await getWardsWithBeds();
    if (res.success) setAdmitWards(res.data || []);
    setShowAdmitModal(true);
  };

  const handleAdmitSubmit = () =>
    withSubmission(async () => {
      if (!activePatient) return;
      if (!admitSelectedBed || !admitSelectedWard) {
        alert("Please select a ward and bed");
        return;
      }
      const { admitPatientIPD } = await import("@/app/actions/ipd-actions");
      const res = await admitPatientIPD({
        patient_id: activePatient.patient_id,
        bed_id: admitSelectedBed,
        ward_id: Number(admitSelectedWard),
        diagnosis: admitDiagnosis,
        doctor_name: doctorName,
      });
      if (!res.success) { alert("Admission failed: " + res.error); return; }
      alert("Patient Admitted");
      setShowAdmitModal(false);
      handleStatusUpdate("Admitted");
    });

  const handleWalkinSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(walkinFormData).forEach(([k, v]) => formData.append(k, v));
      const res = await registerPatient(formData);
      if (res.success) {
        alert(`Walk-in Registered! Patient ID: ${res.patient_id}`);
        setShowWalkinModal(false);
        const q = await getPatientQueue({
          doctor_id: doctorId,
          doctor_name: session?.name,
          doctor_username: session?.username,
          view: viewMode,
          specialty: undefined,
          dateRange: queueDateRange,
          includeAllStatuses: true,
        });
        if (q.success) setQueue(q.data as any);
      } else {
        alert("Registration Failed: " + res.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!activePatient?.appointment_id || isSubmitting) return;
    const updatedQueue = queue.map((p) =>
      p.appointment_id === activePatient.appointment_id
        ? { ...p, status: newStatus }
        : p,
    );
    setQueue(updatedQueue);
    setActivePatient((prev: any) =>
      prev ? { ...prev, status: newStatus } : null,
    );
    await updateAppointmentStatus(activePatient.appointment_id, newStatus);
  };

  const addToCart = () => {
    if (!selectedMedicine) return;
    const med = medicines.find((m: any) => m.brand_name === selectedMedicine);
    if (!med) return;
    setPharmacyCart((prev) => {
      const existing = prev.find((i) => i.name === selectedMedicine);
      if (existing) {
        return prev.map((i) =>
          i.name === selectedMedicine ? { ...i, qty: i.qty + medicineQty } : i,
        );
      }
      return [
        ...prev,
        { name: selectedMedicine, qty: medicineQty, price: med.price_per_unit },
      ];
    });
    setMedicineQty(1);
    setSelectedMedicine("");
  };
  const removeFromCart = (name: string) => {
    setPharmacyCart((prev) => prev.filter((i) => i.name !== name));
  };

  const handlePlaceOrder = () =>
    withSubmission(async () => {
      if (!activePatient || pharmacyCart.length === 0) return;
      const res = await createPharmacyOrder(
        activePatient.patient_id,
        doctorName,
        pharmacyCart,
      );
      if (res.success) {
        setPharmacyOrderResult(true);
        setPharmacyCart([]);
        alert("Order Sent to Pharmacy!");
      } else {
        alert("Order Failed");
      }
    });

  const handlePrintPrescription = () => {
    if (pharmacyCart.length === 0) return alert("Add medicines first!");
    setShowPrescriptionModal(true);
  };

  const handleScheduleFollowUp = () =>
    withSubmission(async () => {
      if (!activePatient?.patient_id) return alert("Select a patient first.");
      if (!followUpDate) return alert("Please select follow-up date & time.");

      const assignedDoctorId = doctorId || session?.id;
      if (!assignedDoctorId) return alert("Unable to detect doctor session.");

      const res = await scheduleFollowUp({
        patientId: activePatient.patient_id,
        doctorId: assignedDoctorId,
        scheduledDate: followUpDate,
        notes: followUpNotes.trim() || undefined,
      });

      if (res.success) {
        alert("Follow-up scheduled successfully.");
        setFollowUpNotes("");
        await fetchPatientFollowUps(activePatient.patient_id);
      } else {
        alert(res.error || "Failed to schedule follow-up.");
      }
    });

  const filteredQueue = queue.filter(
    (p) =>
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.digital_id &&
        p.digital_id.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const getStatusStyle = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "in progress":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "completed":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "cancelled":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "admitted":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      default:
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    }
  };

  const handleDischarge = async () => {
    if (!activePatient || activePatient.status !== "Admitted") return;
    if (!confirm(`Discharge ${activePatient.full_name}?`)) return;
    setIsDischarging(true);
    try {
      const res = await dischargePatient(activePatient.patient_id);
      if (res.success) {
        alert("Patient discharged successfully.");
        handleStatusUpdate("Completed");
      } else {
        alert("Failed to discharge");
      }
    } catch (e) {
      console.error(e);
      alert("Error during discharge.");
    } finally {
      setIsDischarging(false);
    }
  };

  // ─── INPUT STYLES ───
  const inputCls =
    "w-full p-3.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400";
  const labelCls =
    "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] ml-1 block mb-1.5";

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden relative">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area,
          .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            color: black;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* ── NAV SIDEBAR ── */}
      <Sidebar session={session} />

      {/* ── VIDEO CALL MODAL ── */}
      {showVideoModal && selectedVideoRequest && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-black text-xl flex items-center gap-3">
                <Video className="h-6 w-6 text-rose-500" /> Video Call Request
              </h3>
              <button onClick={() => setShowVideoModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Patient Name</p>
                <p className="text-lg font-black text-gray-800 uppercase">{selectedVideoRequest.patient.full_name}</p>
                <p className="text-xs text-gray-500 font-medium">Requested: {new Date(selectedVideoRequest.request_date).toLocaleString()}</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className={labelCls}>Schedule Date & Time</label>
                  <input 
                    type="datetime-local" 
                    className={inputCls}
                    value={videoScheduleTime}
                    onChange={(e) => setVideoScheduleTime(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className={labelCls}>Manual Meeting Link (Google Meet/Zoom)</label>
                  <input 
                    type="url" 
                    className={inputCls}
                    placeholder="https://meet.google.com/xxx-yyyy-zzz"
                    value={videoMeetLink}
                    onChange={(e) => setVideoMeetLink(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className={labelCls}>Rejection Reason (Optional)</label>
                  <textarea 
                    className={inputCls}
                    placeholder="Why are you rejecting?"
                    value={videoRejectionReason}
                    onChange={(e) => setVideoRejectionReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => handleVideoResponse('Rejected')}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black rounded-2xl transition-all disabled:opacity-50"
                >
                  REJECT
                </button>
                <button 
                  onClick={() => handleVideoResponse('Accepted')}
                  disabled={!videoScheduleTime || isSubmitting}
                  className="flex-[2] px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black rounded-2xl shadow-xl shadow-teal-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                >
                  ACCEPT & SEND LINK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DISCHARGE PDF MODAL ── */}
      {showDischargeModal && dischargePdfUrl && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="font-black text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal-400" /> Discharge Summary
              </h3>
              <button
                onClick={() => setShowDischargeModal(false)}
                className="text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-full hover:bg-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 bg-gray-50 p-0 relative">
              <iframe
                src={dischargePdfUrl}
                className="w-full h-full"
                title="Discharge Summary PDF"
              ></iframe>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowDischargeModal(false)}
                className="px-6 py-2.5 font-bold text-gray-400 hover:text-gray-600 rounded-xl"
              >
                Close
              </button>
              <a
                href={dischargePdfUrl}
                download={`Discharge_${activePatient?.full_name}.pdf`}
                className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-2"
              >
                <Clipboard className="h-4 w-4" /> Download PDF
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── WALK-IN MODAL ── */}
      {showWalkinModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-black text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-teal-400" /> Walk-in Registration
              </h3>
              <button
                onClick={() => setShowWalkinModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleWalkinSubmit} className="p-6 space-y-4">
              <input
                required
                placeholder="Full Name"
                className={inputCls}
                value={walkinFormData.full_name}
                onChange={(e) =>
                  setWalkinFormData({
                    ...walkinFormData,
                    full_name: e.target.value,
                  })
                }
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  required
                  placeholder="Phone"
                  className={inputCls}
                  value={walkinFormData.phone}
                  onChange={(e) =>
                    setWalkinFormData({
                      ...walkinFormData,
                      phone: e.target.value,
                    })
                  }
                />
                <input
                  required
                  placeholder="Age"
                  type="number"
                  min="0"
                  className={inputCls}
                  value={walkinFormData.age}
                  onChange={(e) =>
                    setWalkinFormData({
                      ...walkinFormData,
                      age: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <select
                  className={inputCls}
                  value={walkinFormData.gender}
                  onChange={(e) =>
                    setWalkinFormData({
                      ...walkinFormData,
                      gender: e.target.value,
                    })
                  }
                >
                  <option className="bg-white text-gray-900">Male</option>
                  <option className="bg-white text-gray-900">Female</option>
                  <option className="bg-white text-gray-900">Other</option>
                </select>
                <select
                  className={inputCls}
                  value={walkinFormData.department}
                  onChange={(e) =>
                    setWalkinFormData({
                      ...walkinFormData,
                      department: e.target.value,
                    })
                  }
                >
                  <option className="bg-white text-gray-900">General</option>
                  <option className="bg-white text-gray-900">Cardiology</option>
                  <option className="bg-white text-gray-900">
                    Orthopedics
                  </option>
                </select>
              </div>
              <textarea
                placeholder="Address"
                className={inputCls}
                rows={2}
                value={walkinFormData.address}
                onChange={(e) =>
                  setWalkinFormData({
                    ...walkinFormData,
                    address: e.target.value,
                  })
                }
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold py-3.5 rounded-xl hover:from-teal-400 hover:to-emerald-500 disabled:opacity-70 flex justify-center items-center gap-2 shadow-lg shadow-teal-500/20"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Register Patient"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── ADMIT MODAL ── */}
      {showAdmitModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-black text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-400" /> Admit
                Patient
              </h3>
              <button
                onClick={() => setShowAdmitModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Enter provisional diagnosis to admit{" "}
                <strong className="text-gray-700">
                  {activePatient?.full_name}
                </strong>
                .
              </p>
              <textarea
                autoFocus
                className={inputCls}
                rows={3}
                placeholder="Provisional Diagnosis..."
                value={admitDiagnosis}
                onChange={(e) => setAdmitDiagnosis(e.target.value)}
              />
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Select Ward *</label>
                <select
                  className={inputCls}
                  value={admitSelectedWard}
                  onChange={(e) => {
                    setAdmitSelectedWard(e.target.value);
                    setAdmitSelectedBed("");
                    const ward = admitWards.find((w: any) => String(w.id) === e.target.value);
                    setAdmitAvailableBeds(ward?.beds?.filter((b: any) => b.status?.toLowerCase() === "available") || []);
                  }}
                >
                  <option value="">-- Select Ward --</option>
                  {admitWards.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.ward_name} (₹{w.cost_per_day}/day)</option>
                  ))}
                </select>
              </div>
              {admitSelectedWard && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Select Bed *</label>
                  <select
                    className={inputCls}
                    value={admitSelectedBed}
                    onChange={(e) => setAdmitSelectedBed(e.target.value)}
                  >
                    <option value="">-- Select Bed --</option>
                    {admitAvailableBeds.map((b: any) => (
                      <option key={b.bed_id} value={b.bed_id}>{b.bed_id} - {b.bed_type || "Standard"}</option>
                    ))}
                  </select>
                  {admitAvailableBeds.length === 0 && (
                    <p className="text-xs text-rose-500 mt-1">No available beds in this ward</p>
                  )}
                </div>
              )}
              <button
                onClick={handleAdmitSubmit}
                disabled={!admitDiagnosis.trim() || !admitSelectedBed || isSubmitting}
                className="w-full bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold py-3 rounded-xl hover:from-rose-400 hover:to-rose-500 disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-rose-500/20"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Confirm Admission"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRESCRIPTION MODAL ── */}
      {showPrescriptionModal && activePatient && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden print-area">
            <div className="p-8 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Rx Prescription
                </h2>
                <p className="text-sm text-slate-500">Official Prescription</p>
              </div>
              <div className="text-right">
                <h3 className="font-bold text-lg text-slate-900">
                  Avani Hospital
                </h3>
                <p className="text-xs text-slate-500">
                  {doctorName} &bull; {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">
                    Patient
                  </p>
                  <p className="font-bold text-lg text-slate-800">
                    {activePatient.full_name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-400 uppercase">
                    ID
                  </p>
                  <p className="font-mono text-slate-800">
                    {activePatient.digital_id || activePatient.patient_id}
                  </p>
                </div>
              </div>
              <div>
                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <Pill className="h-4 w-4" /> Medicines
                </h4>
                <ul className="divide-y divide-dashed divide-slate-300">
                  {pharmacyCart.map((item, i) => (
                    <li key={i} className="py-2 flex justify-between">
                      <span className="font-medium text-slate-700">
                        {item.name}
                      </span>
                      <span className="font-bold text-slate-900">
                        Qty: {item.qty}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-8 pt-8 border-t border-slate-200">
                <p className="text-sm text-slate-500 italic text-center">
                  Take exactly as prescribed.
                </p>
              </div>
            </div>
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-3 no-print">
              <button
                onClick={() => setShowPrescriptionModal(false)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 flex items-center gap-2"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEFT SIDEBAR — QUEUE ── */}
      <aside className="w-80 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-gray-500 flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-teal-400" /> Patient Queue
            </h3>
            <div className="flex items-center gap-2">
              {pendingRequests.length > 0 && (
                <button 
                  onClick={() => {
                    setSelectedVideoRequest(pendingRequests[0]);
                    setShowVideoModal(true);
                  }}
                  className="bg-rose-500 text-white text-[10px] px-2.5 py-1 rounded-lg font-black flex items-center gap-1.5 animate-bounce shadow-lg shadow-rose-500/20"
                >
                  <Video className="h-3 w-3" /> {pendingRequests.length} CALL REQUESTS
                </button>
              )}
              <span className="bg-teal-500/10 text-teal-400 text-[10px] px-2.5 py-1 rounded-lg font-black border border-teal-500/20">
                {filteredQueue.length}
              </span>
            </div>
          </div>
          {/* ── VIEW MODE TOGGLE ── */}
          <div className="flex mb-3 bg-gray-100 rounded-lg p-0.5">
            <button className="flex-1 text-xs font-bold py-1.5 rounded-md transition-all bg-white text-teal-600 shadow-sm">
              My Patients
            </button>
          </div>
          <div className="flex mb-3 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setQueueDateRange("upcoming")}
              className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${queueDateRange === "upcoming" ? "bg-white text-teal-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setQueueDateRange("all")}
              className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${queueDateRange === "all" ? "bg-white text-teal-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              History + Upcoming
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 group-focus-within:text-teal-400 transition-colors" />
            <input
              type="text"
              placeholder="Search patient..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 outline-none transition-all placeholder:text-gray-400 font-medium text-gray-900"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="text-center p-8 text-gray-400 animate-pulse font-bold">
              Loading queue...
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="text-center p-12 text-gray-400 text-sm flex flex-col items-center gap-2">
              <Users className="h-8 w-8 text-gray-200" />
              No patients found
            </div>
          ) : (
            filteredQueue.map((p) => {
              let parsedSymptoms = p.reason_for_visit;
              let triageLevel = null;
              if (p.reason_for_visit?.includes("AI Triage:")) {
                const parts = p.reason_for_visit.split("| Level: ");
                if (parts.length === 2) {
                  parsedSymptoms = parts[0].replace("AI Triage: ", "").trim();
                  triageLevel = parts[1].trim();
                }
              }

              return (
                <div
                  key={p.appointment_id}
                  onClick={isSubmitting ? undefined : () => setActivePatient(p)}
                  className={`p-4 rounded-xl cursor-pointer transition-all border group relative overflow-hidden ${activePatient?.appointment_id === p.appointment_id ? "bg-teal-500/10 border-teal-500/30 shadow-inner" : "bg-white hover:bg-gray-50 border-gray-200 hover:border-teal-500/20"} ${isSubmitting ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {triageLevel === "Emergency" && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-xl"></div>
                  )}
                  {triageLevel === "Urgent" && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-l-xl"></div>
                  )}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex gap-2 items-center">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${getStatusStyle(p.status)}`}
                      >
                        {p.status || "Pending"}
                      </span>
                      {triageLevel && (
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${triageLevel === "Emergency" ? "bg-red-500/10 text-red-500 border-red-500/20" : triageLevel === "Urgent" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"}`}
                        >
                          {triageLevel}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold bg-gray-100 px-1.5 py-0.5 rounded">
                      {p.appointment_date
                        ? new Date(p.appointment_date).toLocaleTimeString(
                            "en-IN",
                            { hour: "2-digit", minute: "2-digit" },
                          )
                        : "Time N/A"}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm truncate text-gray-800 group-hover:text-teal-600 transition-colors">
                    <Link
                      href={`/doctor/patient/${p.patient_id}?appointmentId=${encodeURIComponent(p.appointment_id || "")}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline underline-offset-2"
                    >
                      {p.full_name}
                    </Link>
                  </h4>
                  <div className="flex gap-2 mt-1 items-center">
                    <span className="text-[10px] text-gray-500 font-semibold">
                      {p.age ? `${p.age}y` : ""}
                      {p.gender ? ` / ${p.gender}` : ""}
                    </span>
                    <span className="text-[10px] text-gray-300">&bull;</span>
                    <span className="text-[10px] text-gray-500 font-semibold">
                      {p.department || "General"}
                    </span>
                  </div>
                  {parsedSymptoms && (
                    <p className="text-[10px] text-gray-400 mt-2 truncate flex items-center gap-1.5 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                      <Brain className="h-3 w-3 shrink-0 text-teal-400" />
                      {parsedSymptoms}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => setShowWalkinModal(true)}
            disabled={isSubmitting}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 font-bold hover:bg-gray-100 hover:text-teal-400 hover:border-teal-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add Walk-in
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {activePatient ? (
          <div className="flex-1 overflow-y-auto p-6 z-10 relative">
            {/* Patient Header Card */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 hover:border-teal-500/20 transition-all">
              <div className="flex items-center gap-5">
                <div className="h-14 w-14 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 rounded-2xl border border-gray-200 flex items-center justify-center">
                  <User className="h-7 w-7 text-violet-400" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                      <Link
                        href={`/doctor/patient/${activePatient.patient_id}?appointmentId=${encodeURIComponent(activePatient.appointment_id || "")}`}
                        className="hover:text-teal-600 hover:underline underline-offset-4 transition-colors"
                      >
                        {activePatient.full_name}
                      </Link>
                    </h1>
                    <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-black px-2 py-1 rounded-lg">
                      ID: {activePatient.digital_id || activePatient.patient_id}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-2 text-xs text-gray-500 font-medium flex-wrap">
                    {activePatient.age && (
                      <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">
                        <User className="h-3 w-3" /> {activePatient.age}y
                        {activePatient.gender
                          ? ` / ${activePatient.gender}`
                          : ""}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">
                      <Clock className="h-3 w-3" />{" "}
                      {new Date(activePatient.created_at).toLocaleTimeString()}
                    </span>
                    <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200">
                      <Stethoscope className="h-3 w-3" />{" "}
                      {activePatient.department}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-center">
                <select
                  value={activePatient.status || "Pending"}
                  onChange={(e) => handleStatusUpdate(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-white border border-gray-300 text-gray-900 text-sm rounded-xl focus:ring-teal-500 p-2.5 font-bold outline-none appearance-none"
                >
                  {[
                    "Scheduled",
                    "Checked In",
                    "In Progress",
                    "Completed",
                    "Cancelled",
                    "Admitted",
                  ].map((s) => (
                    <option
                      key={s}
                      value={s}
                      className="bg-white text-gray-900"
                    >
                      {s}
                    </option>
                  ))}
                </select>
                {activePatient.status === "Admitted" ? (
                  <button
                    onClick={handleDischarge}
                    disabled={isDischarging}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm rounded-xl hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isDischarging ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> DISCHARGE
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => handleOpenAdmitModal()}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold text-sm rounded-xl hover:from-rose-400 hover:to-rose-500 shadow-lg shadow-rose-500/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4" /> ADMIT
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl min-h-[500px] flex flex-col overflow-hidden">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 border-b border-gray-200 px-2 pt-2 gap-1">
                {(
                  [
                    "triage",
                    "notes",
                    "history",
                    "lab",
                    "pharmacy",
                    "followup",
                    "video-calls",
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                        setActiveTab(tab);
                        if (tab === 'video-calls') refreshVideoRequests();
                    }}
                    className={`px-4 py-4 text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-all outline-none text-center ${activeTab === tab ? "border-teal-400 text-teal-400 bg-teal-500/5 rounded-t-lg" : "border-transparent text-gray-400 hover:text-gray-600 rounded-t-lg"}`}
                  >
                    {tab === "triage" && <Brain className="h-4 w-4" />}
                    {tab === "notes" && <FileText className="h-4 w-4" />}
                    {tab === "history" && <History className="h-4 w-4" />}
                    {tab === "lab" && <FlaskConical className="h-4 w-4" />}
                    {tab === "pharmacy" && <Pill className="h-4 w-4" />}
                    {tab === "followup" && <Clock className="h-4 w-4" />}
                    {tab === "video-calls" && <Video className="h-4 w-4" />}
                    {tab === "triage"
                      ? "AI Assessment"
                      : tab === "notes"
                        ? activePatient.status === "Admitted"
                          ? "Medical Notes"
                          : "Clinical Notes"
                        : tab === "history"
                          ? "History"
                          : tab === "lab"
                            ? "Labs"
                            : tab === "pharmacy"
                              ? "Pharmacy"
                              : tab === "video-calls"
                                ? "Video Calls"
                                : "Follow Up"}
                  </button>
                ))}
              </div>

              <div className="p-8 flex-1 flex justify-center">
                {/* AI ASSESSMENT TAB */}
                {activeTab === "triage" && (
                  <div className="w-full max-w-4xl space-y-6">
                    {loadingTriage ? (
                      <div className="text-center py-16 text-gray-400 font-bold flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
                        Loading AI Assessment...
                      </div>
                    ) : !triageData ? (
                      <div className="bg-gray-100 border border-dashed border-gray-300 rounded-2xl p-12 text-center">
                        <Brain className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                        <h3 className="font-black text-gray-500 text-lg mb-1">
                          No AI Assessment Found
                        </h3>
                        <p className="text-gray-400 text-sm font-medium">
                          This patient was registered without AI triage. Proceed
                          to Clinical NotesClinical Notes.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Triage Level Banner */}
                        <div
                          className={`rounded-2xl p-5 border flex items-center justify-between ${triageData.triageLevel === "Emergency" ? "bg-red-500/5 border-red-500/20" : triageData.triageLevel === "Urgent" ? "bg-amber-500/5 border-amber-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`p-3 rounded-xl ${triageData.triageLevel === "Emergency" ? "bg-red-500/10" : triageData.triageLevel === "Urgent" ? "bg-amber-500/10" : "bg-emerald-500/10"}`}
                            >
                              <Shield
                                className={`h-6 w-6 ${triageData.triageLevel === "Emergency" ? "text-red-400" : triageData.triageLevel === "Urgent" ? "text-amber-400" : "text-emerald-400"}`}
                              />
                            </div>
                            <div>
                              <span
                                className={`text-[10px] font-black uppercase tracking-[0.2em] block ${triageData.triageLevel === "Emergency" ? "text-red-400/60" : triageData.triageLevel === "Urgent" ? "text-amber-400/60" : "text-emerald-400/60"}`}
                              >
                                Triage Level
                              </span>
                              <span
                                className={`text-xl font-black ${triageData.triageLevel === "Emergency" ? "text-red-400" : triageData.triageLevel === "Urgent" ? "text-amber-400" : "text-emerald-400"}`}
                              >
                                {triageData.triageLevel}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
                              Department
                            </span>
                            <span className="text-sm font-black text-gray-700">
                              {triageData.recommendedDepartment}
                            </span>
                            <span className="text-[10px] text-gray-300 block mt-0.5">
                              {triageData.triageDate
                                ? new Date(
                                    triageData.triageDate,
                                  ).toLocaleString()
                                : ""}
                            </span>
                          </div>
                        </div>

                        {/* Vitals Row */}
                        {triageData.vitals && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                              <HeartPulse className="h-5 w-5 text-rose-400 mx-auto mb-2" />
                              <span className="text-[10px] font-black text-gray-400 uppercase block">
                                Blood Pressure
                              </span>
                              <span className="text-lg font-black text-gray-700">
                                {triageData.vitals.bloodPressure || "N/A"}
                              </span>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                              <Heart className="h-5 w-5 text-pink-400 mx-auto mb-2" />
                              <span className="text-[10px] font-black text-gray-400 uppercase block">
                                Heart Rate
                              </span>
                              <span className="text-lg font-black text-gray-700">
                                {triageData.vitals.heartRate
                                  ? `${triageData.vitals.heartRate} BPM`
                                  : "N/A"}
                              </span>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                              <Thermometer className="h-5 w-5 text-orange-400 mx-auto mb-2" />
                              <span className="text-[10px] font-black text-gray-400 uppercase block">
                                Temperature
                              </span>
                              <span className="text-lg font-black text-gray-700">
                                {triageData.vitals.temperature
                                  ? `${triageData.vitals.temperature}°C`
                                  : "N/A"}
                              </span>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:border-teal-500/20 transition-all">
                              <Wind className="h-5 w-5 text-cyan-400 mx-auto mb-2" />
                              <span className="text-[10px] font-black text-gray-400 uppercase block">
                                SpO2
                              </span>
                              <span className="text-lg font-black text-gray-700">
                                {triageData.vitals.oxygenSat
                                  ? `${triageData.vitals.oxygenSat}%`
                                  : "N/A"}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Symptoms */}
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                            <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                              <Activity className="h-4 w-4 text-teal-400" />{" "}
                              Reported Symptoms
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {triageData.symptoms?.map(
                                (s: string, i: number) => (
                                  <span
                                    key={i}
                                    className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-bold px-3 py-1.5 rounded-lg"
                                  >
                                    {s}
                                  </span>
                                ),
                              )}
                            </div>
                            <div className="mt-3 text-xs text-gray-400">
                              <span className="font-bold">Duration:</span>{" "}
                              {triageData.duration || "Not specified"} &middot;{" "}
                              <span className="font-bold">Severity:</span>{" "}
                              {triageData.severity || "N/A"}
                            </div>
                          </div>

                          {/* Possible Conditions */}
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                            <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                              <Zap className="h-4 w-4 text-violet-400" />{" "}
                              Possible Conditions
                            </h4>
                            <div className="space-y-2">
                              {triageData.possibleConditions?.map(
                                (c: string, i: number) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2 text-sm text-gray-500"
                                  >
                                    <div className="h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
                                    {c}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>

                          {/* Recommended Tests */}
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                            <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                              <FlaskConical className="h-4 w-4 text-amber-400" />{" "}
                              Recommended Tests
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {triageData.recommendedTests?.map(
                                (t: string, i: number) => (
                                  <span
                                    key={i}
                                    className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold px-3 py-1.5 rounded-lg"
                                  >
                                    {t}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>

                          {/* Medical History */}
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                            <h4 className="font-black text-gray-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                              <FileText className="h-4 w-4 text-cyan-400" />{" "}
                              Medical History
                            </h4>
                            <div className="space-y-2 text-sm text-gray-500">
                              <div>
                                <span className="font-bold text-gray-400 text-xs">
                                  PMH:{" "}
                                </span>
                                {triageData.pastMedicalHistory ||
                                  "None reported"}
                              </div>
                              <div>
                                <span className="font-bold text-gray-400 text-xs">
                                  Medications:{" "}
                                </span>
                                {triageData.currentMedications || "None"}
                              </div>
                              <div>
                                <span className="font-bold text-gray-400 text-xs">
                                  Allergies:{" "}
                                </span>
                                {triageData.allergies || "NKDA"}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Risk Alerts */}
                        {triageData.riskAlerts?.length > 0 && (
                          <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-5">
                            <h4 className="font-black text-rose-400/80 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" /> Risk Alerts
                            </h4>
                            <div className="space-y-2">
                              {triageData.riskAlerts.map(
                                (a: string, i: number) => (
                                  <div
                                    key={i}
                                    className="text-sm text-rose-300/70 font-medium"
                                  >
                                    {a}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                        {/* Professional Clinical Summary */}
                        <div className="space-y-4">
                          <h4 className="font-black text-gray-500 text-xs uppercase tracking-[0.15em] flex items-center gap-2">
                            <Brain className="h-4 w-4 text-teal-400" /> AI
                            Clinical Assessment — Detailed Report
                          </h4>

                          {/* Parse and render the clinical summary in sections */}
                          {(() => {
                            const summary = triageData.clinicalSummary || "";
                            const sections = [
                              {
                                key: "SUBJECTIVE",
                                icon: <User className="h-4 w-4" />,
                                color: "teal",
                                label:
                                  "Subjective — History of Present Illness",
                              },
                              {
                                key: "OBJECTIVE",
                                icon: <Activity className="h-4 w-4" />,
                                color: "cyan",
                                label: "Objective — Examination & Vitals",
                              },
                              {
                                key: "ASSESSMENT",
                                icon: <Stethoscope className="h-4 w-4" />,
                                color: "violet",
                                label: "Assessment — Clinical Impression",
                              },
                              {
                                key: "PLAN",
                                icon: <Clipboard className="h-4 w-4" />,
                                color: "amber",
                                label: "Plan — Investigations & Management",
                              },
                              {
                                key: "IMMEDIATE ACTIONS",
                                icon: <Zap className="h-4 w-4" />,
                                color: "rose",
                                label: "Immediate Actions Required",
                              },
                              {
                                key: "CLINICAL REASONING",
                                icon: <Brain className="h-4 w-4" />,
                                color: "emerald",
                                label: "Clinical Reasoning",
                              },
                            ];

                            // Try to parse sections from the summary
                            const parsed: Record<string, string> = {};
                            let currentKey = "";

                            summary.split("\n").forEach((line: string) => {
                              const trimmed = line.trim();
                              const matchedSection = sections.find(
                                (s) =>
                                  trimmed
                                    .toUpperCase()
                                    .startsWith(s.key + ":") ||
                                  trimmed.toUpperCase() === s.key,
                              );
                              if (matchedSection) {
                                currentKey = matchedSection.key;
                                const afterColon = trimmed
                                  .substring(trimmed.indexOf(":") + 1)
                                  .trim();
                                parsed[currentKey] = afterColon
                                  ? afterColon + "\n"
                                  : "";
                              } else if (currentKey && trimmed) {
                                parsed[currentKey] =
                                  (parsed[currentKey] || "") + trimmed + "\n";
                              }
                            });

                            const hasParsed = Object.keys(parsed).length > 0;

                            if (!hasParsed) {
                              // Fallback: render as plain text if parsing fails
                              return (
                                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                                  <pre className="text-sm text-gray-500 whitespace-pre-wrap leading-relaxed font-sans">
                                    {summary}
                                  </pre>
                                </div>
                              );
                            }

                            const colorMap: Record<string, string> = {
                              teal: "border-teal-500/20 bg-teal-500/[0.03]",
                              cyan: "border-cyan-500/20 bg-cyan-500/[0.03]",
                              violet:
                                "border-violet-500/20 bg-violet-500/[0.03]",
                              amber: "border-amber-500/20 bg-amber-500/[0.03]",
                              rose: "border-rose-500/20 bg-rose-500/[0.03]",
                              emerald:
                                "border-emerald-500/20 bg-emerald-500/[0.03]",
                            };
                            const textColorMap: Record<string, string> = {
                              teal: "text-teal-400",
                              cyan: "text-cyan-400",
                              violet: "text-violet-400",
                              amber: "text-amber-400",
                              rose: "text-rose-400",
                              emerald: "text-emerald-400",
                            };

                            return sections
                              .filter((s) => parsed[s.key])
                              .map((section) => (
                                <div
                                  key={section.key}
                                  className={`border rounded-xl p-5 ${colorMap[section.color]} transition-all hover:border-opacity-40`}
                                >
                                  <div
                                    className={`flex items-center gap-2 mb-3 ${textColorMap[section.color]}`}
                                  >
                                    {section.icon}
                                    <span className="font-black text-xs uppercase tracking-wider">
                                      {section.label}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">
                                    {parsed[section.key]?.trim()}
                                  </div>
                                </div>
                              ));
                          })()}
                        </div>

                        {/* AI Disclaimer + Action */}
                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl p-4">
                          <p className="text-[11px] text-gray-400 font-medium max-w-lg">
                            This is an AI-assisted clinical assessment. All
                            findings should be verified through physical
                            examination and diagnostic confirmation. Final
                            clinical decision rests with the attending
                            physician.
                          </p>
                          <button
                            onClick={() => setActiveTab("notes")}
                            className="px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 flex items-center gap-2 shadow-lg shadow-teal-500/20 shrink-0 ml-4"
                          >
                            <FileText className="h-4 w-4" /> Proceed to Clinical
                            Notes
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {/* NOTES TAB */}
                {activeTab === "notes" && (
                  <div className="w-full max-w-4xl space-y-6">
                    {/* Patient summary bar — always visible in notes tab */}
                    <PatientSummaryBar
                      patient={{
                        patient_id: activePatient.patient_id,
                        full_name: activePatient.full_name,
                        age: activePatient.age,
                        gender: activePatient.gender,
                        patient_type: activePatient.patient_type,
                        department: activePatient.department,
                      }}
                    />
                    {activePatient.status === "Admitted" ? (
                      <>
                        <div className="bg-violet-500/5 border border-violet-500/10 p-4 rounded-xl flex items-center gap-3">
                          <div className="bg-violet-500/10 p-2 rounded-lg">
                            <Clipboard className="h-5 w-5 text-violet-400" />
                          </div>
                          <div>
                            <span className="text-violet-300 text-sm font-bold block">
                              Admitted Patient Record
                            </span>
                            <span className="text-violet-400/60 text-xs">
                              Document routine checks and nursing notes.
                            </span>
                          </div>
                        </div>
                        <div>
                          <label className={labelCls}>Note Type</label>
                          <select
                            value={medicalNoteType}
                            onChange={(e) => setMedicalNoteType(e.target.value)}
                            className={inputCls}
                          >
                            <option className="bg-white text-gray-900">
                              Routine Check
                            </option>
                            <option className="bg-white text-gray-900">
                              Admission Note
                            </option>
                            <option className="bg-white text-gray-900">
                              Nursing
                            </option>
                            <option className="bg-white text-gray-900">
                              Discharge Advice
                            </option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Details</label>
                          <textarea
                            value={medicalNoteDetails}
                            onChange={(e) =>
                              setMedicalNoteDetails(e.target.value)
                            }
                            className={inputCls}
                            placeholder="Enter routine check details..."
                            rows={8}
                          />
                        </div>
                        <div className="flex justify-end pt-4">
                          <button
                            onClick={handleSaveNotes}
                            disabled={isSubmitting}
                            className="px-8 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-emerald-500 flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-50"
                          >
                            {isSubmitting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Save className="h-4 w-4" /> Save Record
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Toolbar: Template picker + Print Rx */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setShowTemplatePicker(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
                          >
                            <FileText className="h-3.5 w-3.5" /> Use Template
                          </button>
                          <button
                            onClick={() => {
                              if (!activePatient) return;
                              setPrescriptionData({
                                patient: {
                                  full_name: activePatient.full_name,
                                  patient_id: activePatient.patient_id,
                                  age: activePatient.age,
                                  gender: activePatient.gender,
                                  phone: activePatient.phone,
                                },
                                doctor: { name: doctorName, specialty: doctorSpecialty },
                                org: { name: 'Hospital' },
                                date: new Date().toISOString(),
                                diagnoses: [],
                                medications: soapP.split('\n').filter(Boolean),
                                instructions: '',
                                follow_up: '',
                              });
                              setShowPrescriptionPrint(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-600 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100"
                          >
                            <Printer className="h-3.5 w-3.5" /> Print Rx
                          </button>
                        </div>

                        {/* AI SOAP Assistant — voice, auto-format, pre-brief */}
                        <SOAPAssistant
                          patientId={activePatient.patient_id}
                          soapS={soapS}
                          soapO={soapO}
                          soapA={soapA}
                          soapP={soapP}
                          diagnosis={diagnosis}
                          onUpdate={(field, value) => {
                            if (field === "soapS") setSoapS(value);
                            else if (field === "soapO") setSoapO(value);
                            else if (field === "soapA") setSoapA(value);
                            else if (field === "soapP") setSoapP(value);
                            else if (field === "diagnosis") setDiagnosis(value);
                          }}
                          disabled={isSubmitting}
                        />

                        {/* Structured SOAP form with ICD-10, vitals, allergy check */}
                        {encounterId ? (
                          <SOAPNoteForm
                            patientId={activePatient.patient_id}
                            encounterId={encounterId}
                            doctorId={doctorId}
                            appointmentId={activePatient.appointment_id}
                          />
                        ) : (
                          <div className="flex items-center gap-2 py-6 text-gray-400 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading encounter...
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {/* HISTORY TAB */}
                {activeTab === "history" && (
                  <div className="w-full max-w-4xl space-y-6">
                    <h3 className="font-black text-gray-700 mb-4 flex items-center gap-2 text-lg">
                      <History className="h-5 w-5 text-violet-400" /> Patient
                      History
                    </h3>
                    {loadingHistory ? (
                      <div className="text-center py-12 text-gray-400 font-bold">
                        Loading history...
                      </div>
                    ) : history.length === 0 ? (
                      <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">
                        No previous records found.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {history.map((record, i) => {
                          const noteText = record.doctor_notes || "";
                          const isSoap = noteText.includes("[SUBJECTIVE]");

                          // Quick and dirty regex to extract sections if it's SOAP
                          const s = isSoap
                            ? noteText
                                .split("[SUBJECTIVE]")[1]
                                ?.split("[OBJECTIVE]")[0]
                                ?.trim()
                            : "";
                          const o = isSoap
                            ? noteText
                                .split("[OBJECTIVE]")[1]
                                ?.split("[ASSESSMENT]")[0]
                                ?.trim()
                            : "";
                          const a = isSoap
                            ? noteText
                                .split("[ASSESSMENT]")[1]
                                ?.split("[PLAN]")[0]
                                ?.trim()
                            : "";
                          const p = isSoap
                            ? noteText
                                .split("[PLAN]")[1]
                                ?.split("[GENERAL_NOTES]")[0]
                                ?.trim()
                            : "";

                          return (
                            <div
                              key={i}
                              className="bg-gray-50 border border-gray-200 p-5 rounded-xl hover:border-teal-500/20 transition-all"
                            >
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <p className="font-bold text-teal-600 text-lg flex items-center gap-2">
                                    {record.diagnosis || "No Diagnosis"}{" "}
                                    {isSoap && (
                                      <span className="text-[10px] bg-teal-500/10 text-teal-500 px-2 py-0.5 rounded uppercase font-black tracking-wider">
                                        SOAP Note
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-sm text-gray-400 mt-1 font-medium">
                                    {new Date(
                                      record.created_at,
                                    ).toLocaleDateString()}{" "}
                                    &bull; {record.doctor_name || "Dr. Unknown"}
                                  </p>
                                </div>
                                <div className="bg-white border border-gray-200 shadow-sm text-gray-400 text-[10px] font-mono px-3 py-1.5 rounded-lg">
                                  #{record.appointment_id}
                                </div>
                              </div>

                              {isSoap ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                  {s && s !== "N/A" && (
                                    <div className="bg-white p-3 rounded-lg border border-gray-100">
                                      <span className="text-[10px] font-black text-teal-400 uppercase block mb-1">
                                        Subjective
                                      </span>
                                      <p className="text-sm text-gray-600">
                                        {s}
                                      </p>
                                    </div>
                                  )}
                                  {o && o !== "N/A" && (
                                    <div className="bg-white p-3 rounded-lg border border-gray-100">
                                      <span className="text-[10px] font-black text-cyan-400 uppercase block mb-1">
                                        Objective
                                      </span>
                                      <p className="text-sm text-gray-600">
                                        {o}
                                      </p>
                                    </div>
                                  )}
                                  {a && a !== "N/A" && (
                                    <div className="bg-white p-3 rounded-lg border border-gray-100">
                                      <span className="text-[10px] font-black text-violet-400 uppercase block mb-1">
                                        Assessment
                                      </span>
                                      <p className="text-sm text-gray-600">
                                        {a}
                                      </p>
                                    </div>
                                  )}
                                  {p && p !== "N/A" && (
                                    <div className="bg-white p-3 rounded-lg border border-gray-100">
                                      <span className="text-[10px] font-black text-amber-400 uppercase block mb-1">
                                        Plan
                                      </span>
                                      <p className="text-sm text-gray-600">
                                        {p}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed bg-white p-4 rounded-xl border border-gray-100 mt-2">
                                  {noteText}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {ipdAdmissions.length > 0 && (
                      <div className="mt-6">
                        <h3 className="font-black text-gray-700 mb-4 flex items-center gap-2 text-lg">
                          <Stethoscope className="h-5 w-5 text-rose-400" /> IPD Journey
                        </h3>
                        <IPDJourneyTab admissions={ipdAdmissions} />
                      </div>
                    )}
                  </div>
                )}
                {/* LAB TAB */}
                {activeTab === "lab" && (
                  <div className="w-full max-w-4xl space-y-8">
                    <div className="bg-violet-500/5 p-6 rounded-2xl border border-violet-500/10">
                      <h3 className="font-black text-violet-300 mb-4 flex items-center gap-2">
                        <FlaskConical className="h-5 w-5 text-violet-400" />{" "}
                        Order New Test
                      </h3>
                      <div className="flex gap-4">
                        <select
                          value={selectedTest}
                          onChange={(e) => setSelectedTest(e.target.value)}
                          className={`flex-1 ${inputCls}`}
                        >
                          <option value="" className="bg-white text-gray-900">
                            Select Test Type...
                          </option>
                          <option
                            value="Complete Blood Count (CBC)"
                            className="bg-white text-gray-900"
                          >
                            Complete Blood Count (CBC)
                          </option>
                          <option
                            value="Lipid Profile"
                            className="bg-white text-gray-900"
                          >
                            Lipid Profile
                          </option>
                          <option
                            value="Dengue NS1 Antigen"
                            className="bg-white text-gray-900"
                          >
                            Dengue NS1 Antigen
                          </option>
                          <option
                            value="Liver Function Test"
                            className="bg-white text-gray-900"
                          >
                            Liver Function Test
                          </option>
                        </select>
                        <button
                          onClick={handleOrderLab}
                          disabled={!selectedTest || isSubmitting}
                          className="px-6 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-400 hover:to-indigo-500 disabled:opacity-50 shadow-lg shadow-violet-500/20 flex items-center gap-2"
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Order Test"
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-gray-700 text-lg">
                          Lab History
                        </h3>
                        <button
                          onClick={() => fetchLabs(activePatient.patient_id)}
                          className="text-teal-400 hover:bg-teal-500/10 p-2 rounded-lg transition-colors"
                        >
                          <RefreshCw
                            className={`h-4 w-4 ${loadingLabs ? "animate-spin" : ""}`}
                          />
                        </button>
                      </div>
                      <div className="space-y-3">
                        {labOrders.length === 0 ? (
                          <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">
                            No lab orders found.
                          </div>
                        ) : (
                          labOrders.map((order) => (
                            <div
                              key={order.id}
                              className="flex items-center justify-between bg-gray-50 border border-gray-200 p-4 rounded-xl hover:border-teal-500/20 transition-all"
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={`h-3 w-3 rounded-full ${order.status === "Completed" ? "bg-emerald-500 shadow-emerald-500/30" : "bg-amber-500 shadow-amber-500/30"} shadow-sm`}
                                />
                                <div>
                                  <p className="font-bold text-gray-700">
                                    {order.test_type}
                                  </p>
                                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                    {order.barcode && (
                                      <span className="font-mono bg-gray-100 px-1 rounded border border-gray-200">
                                        #{order.barcode}
                                      </span>
                                    )}
                                    <span className="text-gray-200">
                                      &bull;
                                    </span>
                                    {new Date(
                                      order.created_at,
                                    ).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${order.status === "Completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}
                                >
                                  {order.status}
                                </span>
                                {order.result_value && (
                                  <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-100 px-2 py-0.5 rounded-lg border border-gray-200 inline-block">
                                    {order.result_value}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* VIDEO CALLS TAB */}
                {activeTab === "video-calls" && (
                    <div className="w-full max-w-4xl space-y-6">
                        <h3 className="font-black text-gray-700 mb-4 flex items-center gap-2 text-lg">
                            <Video className="h-5 w-5 text-rose-400" /> Video Consultations
                        </h3>
                        {loadingVideoRequests ? (
                            <div className="text-center py-12 text-gray-400 font-bold">Loading...</div>
                        ) : allVideoRequests.length === 0 ? (
                            <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">
                                No video consultations found.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {allVideoRequests.map((req, i) => (
                                    <div key={i} className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                                                        req.status === 'Accepted' ? 'bg-emerald-100 text-emerald-600' : 
                                                        req.status === 'Rejected' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                                                    }`}>
                                                        {req.status}
                                                    </span>
                                                    <span className="text-xs text-gray-400 font-medium">#{req.id.slice(-6)}</span>
                                                </div>
                                                <p className="font-black text-gray-800 text-lg uppercase">{req.patient?.full_name}</p>
                                                <p className="text-xs text-gray-500 font-medium mt-1">Requested: {new Date(req.request_date).toLocaleString()}</p>
                                            </div>
                                            {req.scheduled_at && (
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Scheduled For</p>
                                                    <p className="text-sm font-black text-teal-600 bg-teal-50 px-3 py-1 rounded-lg border border-teal-100">
                                                        {new Date(req.scheduled_at).toLocaleString()}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {req.status === 'Accepted' && req.meet_link && (
                                            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                                                <div className="flex-1 mr-4">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Meeting Link</p>
                                                    <p className="text-sm font-medium text-emerald-600 truncate max-w-sm">{req.meet_link}</p>
                                                </div>
                                                <a href={req.meet_link} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl transition-all shadow-lg shadow-emerald-500/20">
                                                    JOIN CALL
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {/* PHARMACY TAB */}
                {activeTab === "pharmacy" && (
                  <div className="w-full max-w-4xl space-y-6">
                    <div className="flex gap-8">
                      <div className="flex-1 space-y-6">
                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                          <div className="flex justify-between items-center mb-6">
                            <h3 className="font-black text-gray-700 flex items-center gap-2">
                              <Pill className="h-5 w-5 text-teal-400" />{" "}
                              Prescribe Medicine
                            </h3>
                            {pharmacyCart.length > 0 && (
                              <button
                                onClick={handlePrintPrescription}
                                className="text-xs font-bold text-gray-400 flex items-center gap-1 hover:text-gray-600"
                              >
                                <Printer className="h-3 w-3" /> Preview Rx
                              </button>
                            )}
                          </div>

                          <div className="flex gap-3 mb-4">
                            <select
                              value={selectedMedicine}
                              onChange={(e) =>
                                setSelectedMedicine(e.target.value)
                              }
                              className={`flex-[2] ${inputCls}`}
                            >
                              <option
                                value=""
                                className="bg-white text-gray-900"
                              >
                                Select Medicine...
                              </option>
                              {medicines.map((m: any) => (
                                <option
                                  key={m.id}
                                  value={m.brand_name}
                                  className="bg-white text-gray-900"
                                >
                                  {m.brand_name} ({"\u20B9"}
                                  {m.price_per_unit})
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="1"
                              value={medicineQty}
                              onChange={(e) =>
                                setMedicineQty(parseInt(e.target.value) || 1)
                              }
                              className={`w-20 text-center ${inputCls}`}
                            />
                            <button
                              onClick={addToCart}
                              disabled={!selectedMedicine}
                              className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white p-3 rounded-xl shadow-md active:scale-95 transition-transform"
                            >
                              <Plus className="h-5 w-5" />
                            </button>
                          </div>

                          {/* Quick Prescribe Chips */}
                          {medicines.length > 0 && (
                            <div className="mb-6">
                              <span className="text-[10px] font-black tracking-wider uppercase text-gray-400 block mb-2">
                                ⚡ Quick Add Common Rx
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {medicines.slice(0, 4).map((m: any) => (
                                  <button
                                    key={m.id}
                                    onClick={() => {
                                      const existing = pharmacyCart.find(
                                        (i) => i.name === m.brand_name,
                                      );
                                      if (existing) {
                                        setPharmacyCart((prev) =>
                                          prev.map((i) =>
                                            i.name === m.brand_name
                                              ? { ...i, qty: i.qty + 1 }
                                              : i,
                                          ),
                                        );
                                      } else {
                                        setPharmacyCart((prev) => [
                                          ...prev,
                                          {
                                            name: m.brand_name,
                                            qty: 1,
                                            price: m.price_per_unit,
                                          },
                                        ]);
                                      }
                                    }}
                                    className="text-xs font-bold px-3 py-1.5 bg-gray-100 hover:bg-teal-50 border border-gray-200 hover:border-teal-500/30 text-gray-600 hover:text-teal-600 rounded-lg transition-all flex items-center gap-1 shadow-sm"
                                  >
                                    <Plus className="h-3 w-3" /> {m.brand_name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-100 px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] flex justify-between border-b border-gray-200">
                              <span>Current Rx Cart</span>
                              <span>{pharmacyCart.length} Items</span>
                            </div>
                            {pharmacyCart.length === 0 ? (
                              <div className="p-8 text-center text-gray-300 text-sm font-bold">
                                Add medicines to create prescription
                              </div>
                            ) : (
                              <div className="divide-y divide-gray-100">
                                {pharmacyCart.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
                                  >
                                    <div>
                                      <span className="font-bold text-gray-700 text-sm block">
                                        {item.name}
                                      </span>
                                      <span className="text-xs text-gray-400">
                                        Qty: {item.qty}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => removeFromCart(item.name)}
                                      className="text-rose-400 hover:text-rose-300 text-xs font-bold bg-rose-500/10 px-2 py-1 rounded-lg hover:bg-rose-500/20 transition-colors border border-rose-500/20"
                                    >
                                      REMOVE
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {pharmacyCart.length > 0 && (
                              <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                                <button
                                  onClick={handlePlaceOrder}
                                  disabled={isSubmitting}
                                  className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-bold px-6 py-3 rounded-xl hover:from-teal-400 hover:to-emerald-500 shadow-lg shadow-teal-500/20 w-full flex justify-center items-center gap-2 disabled:opacity-50"
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Send to Pharmacy"
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {pharmacyOrderResult && (
                        <div className="flex-1 bg-white border border-gray-200 shadow-sm rounded-2xl p-6 h-fit">
                          <div className="flex items-center gap-3 mb-6 text-emerald-400 font-bold border-b border-gray-200 pb-4">
                            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                              <CheckCircle2 className="h-6 w-6" />
                            </div>
                            <div>
                              <span className="block text-lg">Order Sent</span>
                              <span className="text-xs text-emerald-400/60 font-normal">
                                Pending Pharmacist Review
                              </span>
                            </div>
                          </div>
                          <div className="space-y-4 text-sm">
                            <p className="text-gray-500 text-sm">
                              The prescription has been forwarded to the
                              pharmacy department for processing.
                            </p>
                            <button
                              onClick={() => setPharmacyOrderResult(null)}
                              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 border border-gray-200"
                            >
                              New Order
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* FOLLOW-UP TAB */}
                {activeTab === "followup" && activePatient && (
                  <div className="w-full max-w-4xl space-y-6">
                    <div className="bg-amber-500/5 border border-amber-500/10 p-6 rounded-2xl">
                      <h3 className="font-black text-amber-700 mb-4 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-amber-500" /> Schedule
                        Follow-Up
                      </h3>
                      <p className="text-sm text-gray-500 mb-5">
                        Assign next checkup date for
                        <span className="font-bold text-gray-700">
                          {" "}
                          {activePatient.full_name}
                        </span>
                        . This entry will automatically appear in Follow-Ups
                        Manager.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={labelCls}>
                            Follow-Up Date & Time
                          </label>
                          <input
                            type="datetime-local"
                            value={followUpDate}
                            onChange={(e) => setFollowUpDate(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Doctor</label>
                          <input
                            value={doctorName}
                            disabled
                            className={`${inputCls} bg-gray-100 text-gray-500`}
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className={labelCls}>Follow-Up Notes</label>
                        <textarea
                          value={followUpNotes}
                          onChange={(e) => setFollowUpNotes(e.target.value)}
                          className={inputCls}
                          rows={4}
                          placeholder="Reason for follow-up, instructions, warning signs to monitor..."
                        />
                      </div>

                      <div className="flex justify-end mt-5">
                        <button
                          onClick={handleScheduleFollowUp}
                          disabled={isSubmitting || !followUpDate}
                          className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl hover:from-amber-400 hover:to-orange-500 flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Save className="h-4 w-4" /> Save Follow-Up
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                        <h4 className="font-black text-gray-700">
                          Patient Follow-Up History
                        </h4>
                        <button
                          onClick={() =>
                            fetchPatientFollowUps(activePatient.patient_id)
                          }
                          className="text-teal-500 hover:bg-teal-500/10 p-2 rounded-lg transition-colors"
                          title="Refresh follow-ups"
                        >
                          <RefreshCw
                            className={`h-4 w-4 ${loadingFollowUps ? "animate-spin" : ""}`}
                          />
                        </button>
                      </div>

                      <div className="p-4 space-y-3">
                        {loadingFollowUps ? (
                          <div className="text-center py-8 text-gray-400 font-bold">
                            Loading follow-ups...
                          </div>
                        ) : patientFollowUps.length === 0 ? (
                          <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm font-bold">
                            No follow-up records for this patient yet.
                          </div>
                        ) : (
                          patientFollowUps.map((item) => (
                            <div
                              key={item.id}
                              className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4"
                            >
                              <div>
                                <p className="text-sm font-bold text-gray-700">
                                  {new Date(
                                    item.scheduled_date,
                                  ).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {item.notes || "No notes added."}
                                </p>
                              </div>
                              <span
                                className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${item.status === "Completed" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"}`}
                              >
                                {item.status}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 relative">
            <div className="z-10 flex flex-col items-center">
              <div className="h-24 w-24 bg-gray-100 rounded-full mb-6 border border-gray-200 flex items-center justify-center">
                <Users className="h-10 w-10 text-gray-200" />
              </div>
              <h2 className="text-xl font-black text-gray-500 mb-2">
                Ready for Consultation
              </h2>
              <p className="text-gray-400 max-w-xs text-center font-medium">
                Select a patient from the queue to start consultation.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Template Picker Modal */}
      {showTemplatePicker && (
        <TemplatePicker
          doctorId={doctorId}
          onSelect={(content) => {
            try {
              const parsed = JSON.parse(content);
              if (parsed.subjective) setSoapS(parsed.subjective);
              if (parsed.objective) setSoapO(parsed.objective);
              if (parsed.assessment) setSoapA(parsed.assessment);
              if (parsed.plan) setSoapP(parsed.plan);
              if (parsed.diagnosis) setDiagnosis(parsed.diagnosis);
            } catch {
              setSoapS(content);
            }
          }}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}

      {/* Prescription Print Modal */}
      {showPrescriptionPrint && prescriptionData && (
        <PrescriptionPrint
          data={prescriptionData}
          onClose={() => setShowPrescriptionPrint(false)}
        />
      )}
    </div>
  );
}
