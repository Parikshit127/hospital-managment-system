'use client';

import { Download, Users, Stethoscope, Receipt, FlaskConical, Pill, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import type { ImportType } from '@/app/types/import';

const TEMPLATES: { type: ImportType; label: string; icon: React.ElementType; description: string; fields: string }[] = [
    { type: 'patients', label: 'Patient Records', icon: Users, description: 'Patient demographics, contact details, and medical history', fields: 'Name, Phone, Age, Gender, Aadhaar, Blood Group, DOB, Allergies, Chronic Conditions' },
    { type: 'staff', label: 'Staff & Doctors', icon: Stethoscope, description: 'Hospital staff accounts with roles and specialties', fields: 'Name, Username, Role, Email, Phone, Specialty, Consultation Fee' },
    { type: 'invoices', label: 'Invoices & Billing', icon: Receipt, description: 'Historical invoice and payment records', fields: 'Invoice Number, Patient ID, Type, Total, Discount, Paid, Status, Date' },
    { type: 'lab_results', label: 'Lab Results', icon: FlaskConical, description: 'Laboratory test orders and results', fields: 'Patient ID, Doctor, Test Type, Status, Result, Remarks' },
    { type: 'pharmacy', label: 'Pharmacy Inventory', icon: Pill, description: 'Medicine catalog with batch and stock details', fields: 'Brand Name, Generic Name, Price, Batch, Stock, Expiry, Rack' },
    { type: 'appointments', label: 'Appointments', icon: CalendarDays, description: 'Historical appointment records', fields: 'Patient ID, Doctor, Department, Status, Reason, Date' },
];

export default function ImportTemplatesPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Import Templates</h1>
                    <p className="text-sm text-gray-500 mt-1">Download pre-formatted templates for data import</p>
                </div>
                <Link
                    href="/admin/data-import"
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
                >
                    Start Import
                </Link>
            </div>

            <div className="grid gap-4">
                {TEMPLATES.map(tmpl => {
                    const Icon = tmpl.icon;
                    return (
                        <div key={tmpl.type} className="bg-white border border-gray-200 rounded-2xl p-5 flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                <Icon size={20} className="text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base font-semibold text-gray-900">{tmpl.label}</h3>
                                <p className="text-sm text-gray-500 mt-0.5">{tmpl.description}</p>
                                <p className="text-xs text-gray-400 mt-1">Fields: {tmpl.fields}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <a
                                    href={`/api/import/template/${tmpl.type}?format=xlsx`}
                                    download
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100 border border-emerald-200"
                                >
                                    <Download size={14} /> Excel
                                </a>
                                <a
                                    href={`/api/import/template/${tmpl.type}?format=csv`}
                                    download
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100 border border-gray-200"
                                >
                                    <Download size={14} /> CSV
                                </a>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
