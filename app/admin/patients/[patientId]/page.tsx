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
} from "lucide-react";
import { AdminPage } from "../../components/AdminPage";
import { getAdminPatientFullDetails } from "@/app/actions/admin-actions";

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
    <span className="text-xs font-black uppercase tracking-wider bg-teal-500/10 text-teal-700 border border-teal-500/20 px-3 py-1 rounded-lg">
      {patient.patient_id}
    </span>
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
            <Loader2 className="h-8 w-8 animate-spin text-teal-500 mx-auto" />
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
                  <span className="h-12 w-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center flex-shrink-0">
                    <User className="h-6 w-6 text-teal-600" />
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
                            ? "border-teal-500 text-teal-700 bg-teal-50/30"
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
                    insurancePolicies={data.insurancePolicies || []}
                    pillReminders={data.pillReminders || []}
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
