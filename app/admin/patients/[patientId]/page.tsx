"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  User,
  ArrowLeft,
  CalendarDays,
  Stethoscope,
  FlaskConical,
  IndianRupee,
  FileText,
  ClipboardList,
  Pill,
  Bed,
  Loader2,
  BedDouble,
  Trash2,
  Clock,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AdminPage } from "../../components/AdminPage";
import { getAdminPatientFullDetails } from "@/app/actions/admin-actions";
import { archivePatient, hardDeletePatient, updatePatient } from "@/app/actions/reception-actions";
import { useToast } from "@/app/components/ui/Toast";

import OverviewTab from "./tabs/OverviewTab";
import OPDHistoryTab from "./tabs/OPDHistoryTab";
import IPDJourneyTab from "./tabs/IPDJourneyTab";
import PrescriptionsLabTab from "./tabs/PrescriptionsLabTab";
import BillingPaymentsTab from "./tabs/BillingPaymentsTab";
import DocumentsTab from "./tabs/DocumentsTab";

type TabKey =
  | "overview"
  | "opd"
  | "ipd"
  | "prescriptions"
  | "billing"
  | "documents";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: User },
  { key: "opd", label: "OPD History", icon: CalendarDays },
  { key: "ipd", label: "IPD Journey", icon: BedDouble },
  { key: "prescriptions", label: "Prescriptions & Lab", icon: Pill },
  { key: "billing", label: "Billing & Payments", icon: IndianRupee },
  { key: "documents", label: "Documents", icon: FileText },
];

export default function AdminPatientDetailsPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = String(params?.patientId || "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit mode for patient demographics (Overview tab)
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const router = useRouter();
  const toast = useToast();

  const handleArchive = async () => {
    if (!window.confirm("Archive this patient? They will be hidden from patient lists but data is preserved.")) return;
    setArchiving(true);
    const res = await archivePatient(patientId);
    setArchiving(false);
    if (res.success) {
      toast.success("Patient archived successfully");
      router.push("/admin/patients");
    } else {
      toast.error(res.error || "Archive failed");
    }
  };

  const startEdit = () => {
    if (!data?.patient) return;
    setActiveTab("overview"); // Edit mode only meaningful on Overview tab
    const p = data.patient;
    setDraft({
      full_name: p.full_name ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
      address: p.address ?? '',
      age: p.age ?? '',
      gender: p.gender ?? '',
      date_of_birth: p.date_of_birth ?? '',
      blood_group: p.blood_group ?? '',
      aadhar_card: p.aadhar_card ?? '',
      abha_number: p.abha_number ?? '',
      pan_number: p.pan_number ?? '',
      emergency_contact_name: p.emergency_contact_name ?? '',
      emergency_contact_phone: p.emergency_contact_phone ?? '',
      emergency_contact_relation: p.emergency_contact_relation ?? '',
      allergies: p.allergies ?? '',
      chronic_conditions: p.chronic_conditions ?? '',
      // Billing / payer
      patient_type: p.patient_type ?? 'cash',
      corporate_id: p.corporate_id ?? '',
      corporate_card_number: p.corporate_card_number ?? '',
      employee_id: p.employee_id ?? '',
    });
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft({});
  };

  const saveEdit = async () => {
    if (!data?.patient) return;
    // Compute changed fields only — sending all is fine, but minimizes audit log noise
    const original = data.patient;
    const changed: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      if ((original[k] ?? '') !== v) changed[k] = v;
    }
    if (Object.keys(changed).length === 0) {
      toast.success("No changes to save");
      setIsEditing(false);
      return;
    }
    setSaving(true);
    const res = await updatePatient(patientId, changed);
    setSaving(false);
    if (res.success) {
      toast.success(`Updated ${Object.keys(changed).length} field${Object.keys(changed).length > 1 ? 's' : ''}`);
      setIsEditing(false);
      setDraft({});
      loadData();
    } else {
      toast.error(res.error || "Failed to update patient");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("PERMANENTLY DELETE this patient? This action is ONLY for registration mistakes. If the patient has any medical or billing history, deletion will be blocked.")) return;
    setDeleting(true);
    const res = await hardDeletePatient(patientId);
    setDeleting(false);
    if (res.success) {
      toast.success("Patient record deleted permanently");
      router.push("/admin/patients");
    } else {
      toast.error(res.error || "Delete failed");
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getAdminPatientFullDetails(patientId);
      if (res.success && res.data) {
        setData(res.data);
        setError("");
      } else {
        setError(res.error || "Unable to load patient details.");
      }
    } catch (e) {
      console.error("Patient details load failed", e);
      setError("Something went wrong while loading patient details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) loadData();
  }, [patientId]);

  const patient = data?.patient;
  const summary = data?.summary;

  const fmtDate = (v?: string | Date | null) => {
    if (!v) return "N/A";
    return new Date(v).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const headerActions = patient ? (
    <div className="flex items-center gap-2">
      <span className="text-xs font-black uppercase tracking-wider bg-orange-500/10 text-orange-700 border border-orange-500/20 px-3 py-1 rounded-lg">
        {patient.patient_id}
      </span>
      {isEditing ? (
        <>
          <button onClick={saveEdit} disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={cancelEdit} disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-[10px] font-bold rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <X className="h-3 w-3" /> Cancel
          </button>
        </>
      ) : (
        <>
          <button onClick={startEdit} disabled={archiving || deleting}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-lg hover:bg-emerald-50 disabled:opacity-50">
            <Pencil className="h-3 w-3" /> Edit
          </button>
          {data?.currentUserRole === 'admin' && (
            <>
              <button onClick={handleArchive} disabled={archiving || deleting}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-500 text-[10px] font-bold rounded-lg hover:bg-gray-50 disabled:opacity-50"
                title="Admin-only: archive this patient">
                <Clock className="h-3 w-3" /> {archiving ? 'Archiving…' : 'Archive'}
              </button>
              <button onClick={handleDelete} disabled={archiving || deleting}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-500 text-[10px] font-bold rounded-lg hover:bg-red-50 disabled:opacity-50"
                title="Admin-only: permanently delete a mistakenly-registered patient">
                <Trash2 className="h-3 w-3" /> {deleting ? 'Deleting…' : 'Delete Mistake'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  ) : null;

  const quickStats = summary
    ? [
        {
          label: "Appointments",
          value: summary.totalAppointments,
          icon: CalendarDays,
          cls: "text-blue-600 bg-blue-50 border-blue-100",
        },
        {
          label: "Admissions",
          value: summary.totalAdmissions,
          icon: BedDouble,
          cls: "text-rose-600 bg-rose-50 border-rose-100",
        },
        {
          label: "Lab Orders",
          value: summary.totalLabOrders,
          icon: FlaskConical,
          cls: "text-amber-600 bg-amber-50 border-amber-100",
        },
        {
          label: "Prescriptions",
          value: summary.totalPrescriptions,
          icon: Pill,
          cls: "text-emerald-600 bg-emerald-50 border-emerald-100",
        },
        {
          label: "Total Billed",
          value: `₹${(summary.totalInvoiceAmount || 0).toLocaleString("en-IN")}`,
          icon: IndianRupee,
          cls: "text-violet-600 bg-violet-50 border-violet-100",
        },
        {
          label: "Balance Due",
          value: `₹${(summary.totalBalanceDue || 0).toLocaleString("en-IN")}`,
          icon: IndianRupee,
          cls: summary.totalBalanceDue > 0
            ? "text-rose-600 bg-rose-50 border-rose-100"
            : "text-emerald-600 bg-emerald-50 border-emerald-100",
        },
      ]
    : [];

  return (
    <AdminPage
      pageTitle={patient ? patient.full_name : "Patient Details"}
      pageIcon={<User className="h-5 w-5" />}
      headerActions={headerActions}
      onRefresh={loadData}
      refreshing={loading}
    >
      <div className="space-y-6">
        {/* Back Button */}
        <Link
          href="/admin/patients"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-bold border border-gray-200 bg-white rounded-xl hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Patient List
        </Link>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto" />
            <p className="text-gray-400 text-sm mt-3">
              Loading patient details...
            </p>
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
            {/* Patient Header Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="h-12 w-12 rounded-2xl bg-orange-50 border border-teal-100 flex items-center justify-center flex-shrink-0">
                    <User className="h-6 w-6 text-orange-600" />
                  </span>
                  <div>
                    <h1 className="text-xl md:text-2xl font-black text-gray-900">
                      {patient.full_name}
                    </h1>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-xs font-semibold text-gray-600">
                      <span className="bg-gray-100 border border-gray-200 rounded-lg px-2 py-1">
                        {patient.age || "N/A"}y / {patient.gender || "N/A"}
                      </span>
                      {patient.blood_group && (
                        <span className="bg-rose-50 text-rose-700 border border-rose-200 rounded-lg px-2 py-1">
                          {patient.blood_group}
                        </span>
                      )}
                      {patient.department && (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-1">
                          {patient.department}
                        </span>
                      )}
                      {summary?.activeAdmission && (
                        <span className="bg-rose-500 text-white rounded-lg px-2 py-1 animate-pulse">
                          Currently Admitted
                        </span>
                      )}
                      <span className="bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 text-gray-500">
                        Registered: {fmtDate(patient.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-medium text-gray-600">
                  {patient.phone && (
                    <span className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
                      {patient.phone}
                    </span>
                  )}
                  {patient.email && (
                    <span className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 truncate max-w-[200px]">
                      {patient.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickStats.map((s) => (
                <div
                  key={s.label}
                  className="bg-white border border-gray-200 rounded-2xl p-3"
                >
                  <span
                    className={`inline-flex p-1.5 rounded-lg border ${s.cls}`}
                  >
                    <s.icon className="h-3.5 w-3.5" />
                  </span>
                  <p className="mt-1.5 text-lg font-black text-gray-900">
                    {s.value}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Tab Navigation */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="border-b border-gray-200 overflow-x-auto">
                <nav className="flex min-w-max">
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab.key;
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                          isActive
                            ? "border-orange-500 text-orange-700 bg-orange-50/30"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="p-5 md:p-6">
                {activeTab === "overview" && (
                  <OverviewTab
                    patient={patient}
                    patientId={patientId}
                    insurancePolicies={data.insurancePolicies || []}
                    pillReminders={data.pillReminders || []}
                    isEditing={isEditing}
                    draft={draft}
                    onDraftChange={(field, value) => setDraft(prev => ({ ...prev, [field]: value }))}
                    onPolicyChanged={loadData}
                  />
                )}
                {activeTab === "opd" && (
                  <OPDHistoryTab
                    appointments={data.appointments || []}
                    clinicalEHRs={data.clinicalEHRs || []}
                    vitalSigns={data.vitalSigns || []}
                    followUps={data.followUps || []}
                  />
                )}
                {activeTab === "ipd" && (
                  <IPDJourneyTab admissions={data.admissions || []} />
                )}
                {activeTab === "prescriptions" && (
                  <PrescriptionsLabTab
                    pharmacyOrders={data.pharmacyOrders || []}
                    labOrders={data.labOrders || []}
                  />
                )}
                {activeTab === "billing" && (
                  <BillingPaymentsTab
                    invoices={data.invoices || []}
                    patientDeposits={data.patientDeposits || []}
                    insurancePolicies={data.insurancePolicies || []}
                    summary={data.summary || {}}
                  />
                )}
                {activeTab === "documents" && (
                  <DocumentsTab
                    patient={patient}
                    admissions={data.admissions || []}
                    labOrders={data.labOrders || []}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminPage>
  );
}
