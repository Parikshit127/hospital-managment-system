"use client";

import React, { useState } from "react";
import { Printer, User, FileText, ClipboardList, FlaskConical, ScrollText, BedDouble, ExternalLink } from "lucide-react";

interface PrintCard {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  placeholder: string;
  buildUrl: (id: string) => string;
  color: string;
}

const PRINT_CARDS: PrintCard[] = [
  {
    id: "wristband",
    icon: User,
    title: "Patient Wristband",
    description: "Print bedside wristband label with patient ID and admission details.",
    placeholder: "Admission ID",
    buildUrl: (id) => `/api/ipd/wristband/${id}`,
    color: "teal",
  },
  {
    id: "facesheet",
    icon: ClipboardList,
    title: "Admission Facesheet",
    description: "Full admission summary sheet for the patient file.",
    placeholder: "Admission ID",
    buildUrl: (id) => `/api/ipd/facesheet/${id}`,
    color: "emerald",
  },
  {
    id: "invoice",
    icon: FileText,
    title: "Invoice / Receipt",
    description: "Print or download a billing invoice or payment receipt.",
    placeholder: "Invoice ID",
    buildUrl: (id) => `/finance/invoices/${id}?print=1`,
    color: "teal",
  },
  {
    id: "prescription",
    icon: ScrollText,
    title: "Prescription",
    description: "Printed prescription from a doctor consultation or visit.",
    placeholder: "Appointment / Visit ID",
    buildUrl: (id) => `/doctor/prescription/print/${id}`,
    color: "emerald",
  },
  {
    id: "lab",
    icon: FlaskConical,
    title: "Lab Report",
    description: "Patient lab investigation report with results and reference ranges.",
    placeholder: "Lab Report ID",
    buildUrl: (id) => `/lab/reports/${id}/print`,
    color: "teal",
  },
  {
    id: "discharge",
    icon: BedDouble,
    title: "Discharge Summary",
    description: "Comprehensive discharge summary for the patient and referrals.",
    placeholder: "Admission ID",
    buildUrl: (id) => `/ipd/discharge-summary/${id}/print`,
    color: "emerald",
  },
];

const colorMap: Record<string, { bg: string; icon: string; btn: string; border: string }> = {
  teal: {
    bg: "bg-teal-50",
    icon: "bg-teal-100 text-teal-600",
    btn: "bg-teal-600 hover:bg-teal-700 text-white",
    border: "border-teal-100 hover:border-teal-200",
  },
  emerald: {
    bg: "bg-emerald-50",
    icon: "bg-emerald-100 text-emerald-600",
    btn: "bg-emerald-600 hover:bg-emerald-700 text-white",
    border: "border-emerald-100 hover:border-emerald-200",
  },
};

function PrintCard({ card }: { card: PrintCard }) {
  const [value, setValue] = useState("");
  const colors = colorMap[card.color];
  const Icon = card.icon;

  const handleOpen = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    window.open(card.buildUrl(trimmed), "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className={`flex flex-col gap-4 p-5 rounded-2xl border ${colors.border} bg-white shadow-sm hover:shadow-md transition-all duration-200`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl shrink-0 ${colors.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">{card.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{card.description}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleOpen()}
          placeholder={card.placeholder}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100 text-gray-800 placeholder:text-gray-400 transition"
        />
        <button
          onClick={handleOpen}
          disabled={!value.trim()}
          title="Open for Print"
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${colors.btn}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Print
        </button>
      </div>
    </div>
  );
}

export default function PrintCenterPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--admin-bg, #f8f8f6)" }}>
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-teal-600 text-white shadow-md">
            <Printer className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-gray-900">Print Center</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Generate and print hospital documents — enter the ID and click Print.
            </p>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRINT_CARDS.map((card) => (
            <PrintCard key={card.id} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}
