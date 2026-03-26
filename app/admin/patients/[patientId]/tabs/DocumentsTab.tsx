'use client';

import React from 'react';
import {
  User,
  FileText,
  CreditCard,
  FlaskConical,
  ExternalLink,
  FolderOpen,
} from 'lucide-react';

interface DocumentsTabProps {
  patient: any;
  admissions: any[];
  labOrders: any[];
}

interface DocumentItem {
  type: string;
  url: string;
  date?: string | Date | null;
  label?: string;
  isCritical?: boolean;
}

const fmtDate = (v?: string | Date | null) => {
  if (!v) return 'N/A';
  return new Date(v).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getDocIcon = (type: string) => {
  switch (type) {
    case 'Profile Photo':
      return User;
    case 'Consent Form':
      return FileText;
    case 'ID Card':
      return CreditCard;
    case 'Lab Report':
      return FlaskConical;
    default:
      return FileText;
  }
};

const getDocIconColor = (type: string) => {
  switch (type) {
    case 'Profile Photo':
      return 'bg-indigo-50 text-indigo-600 border-indigo-200';
    case 'Consent Form':
      return 'bg-teal-50 text-teal-600 border-teal-200';
    case 'ID Card':
      return 'bg-violet-50 text-violet-600 border-violet-200';
    case 'Lab Report':
      return 'bg-amber-50 text-amber-600 border-amber-200';
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};

export default function DocumentsTab({ patient, admissions, labOrders }: DocumentsTabProps) {
  const documents: DocumentItem[] = [];

  // Profile photo
  if (patient.profile_photo_url) {
    documents.push({
      type: 'Profile Photo',
      url: patient.profile_photo_url,
      date: patient.created_at,
    });
  }

  // Admission consent forms
  admissions.forEach((admission: any) => {
    if (admission.consent_signature_url) {
      documents.push({
        type: 'Consent Form',
        url: admission.consent_signature_url,
        date: admission.admission_date,
        label: `Admission ${admission.admission_id || ''}`,
      });
    }
    if (admission.id_cards_url) {
      documents.push({
        type: 'ID Card',
        url: admission.id_cards_url,
        date: admission.admission_date,
        label: `Admission ${admission.admission_id || ''}`,
      });
    }
  });

  // Lab reports
  labOrders.forEach((lab: any) => {
    if (lab.report_url) {
      documents.push({
        type: 'Lab Report',
        url: lab.report_url,
        date: lab.created_at,
        label: `${lab.test_type || 'Test'} (${lab.barcode || 'N/A'})`,
        isCritical: lab.is_critical,
      });
    }
  });

  if (documents.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
        <FolderOpen className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-400 text-sm font-medium">
          No documents available for this patient
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {documents.map((doc, idx) => {
        const Icon = getDocIcon(doc.type);
        const iconColor = getDocIconColor(doc.type);

        return (
          <div
            key={idx}
            className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-colors relative"
          >
            {doc.isCritical && (
              <span className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-red-500" />
            )}

            <div className="flex items-start gap-3 mb-3">
              <span
                className={`p-2 rounded-xl border shrink-0 ${iconColor}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800">{doc.type}</p>
                {doc.label && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{doc.label}</p>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-3">{fmtDate(doc.date)}</p>

            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-xs font-bold hover:bg-teal-100 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Document
            </a>
          </div>
        );
      })}
    </div>
  );
}
