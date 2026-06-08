'use client';

import React, { useEffect, useState } from 'react';
import {
  User,
  Phone,
  Mail,
  MapPin,
  ShieldAlert,
  Heart,
  Shield,
  Pill,
  Clock,
  Building2,
  CreditCard,
} from 'lucide-react';
import { getCorporateMasters } from '@/app/actions/patient-type-actions';

interface OverviewTabProps {
  patient: any;
  insurancePolicies: any[];
  pillReminders: any[];
  isEditing?: boolean;
  draft?: Record<string, string>;
  onDraftChange?: (field: string, value: string) => void;
}

// Reusable read-or-input cell used in edit mode.
function EditableField({
  label,
  field,
  value,
  isEditing,
  draft,
  onChange,
  type = 'text',
  options,
  placeholder,
}: {
  label: string;
  field: string;
  value: string;
  isEditing: boolean;
  draft?: Record<string, string>;
  onChange?: (field: string, value: string) => void;
  type?: 'text' | 'date' | 'select' | 'textarea';
  options?: string[];
  placeholder?: string;
}) {
  if (!isEditing) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-gray-800 mt-0.5">{value || 'N/A'}</p>
      </div>
    );
  }
  const v = draft?.[field] ?? '';
  const handle = (nv: string) => onChange?.(field, nv);
  return (
    <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-3">
      <label className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide block mb-1">{label}</label>
      {type === 'select' && options ? (
        <select
          value={v}
          onChange={(e) => handle(e.target.value)}
          className="w-full text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-md px-2 py-1"
        >
          <option value="">— Select —</option>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          value={v}
          onChange={(e) => handle(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-md px-2 py-1"
        />
      ) : (
        <input
          type={type}
          value={v}
          onChange={(e) => handle(e.target.value)}
          placeholder={placeholder}
          className="w-full text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-md px-2 py-1"
        />
      )}
    </div>
  );
}

const fmtDate = (v?: string | Date | null) => {
  if (!v) return 'N/A';
  return new Date(v).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function OverviewTab({ patient, insurancePolicies, pillReminders, isEditing = false, draft, onDraftChange }: OverviewTabProps) {
  const bloodGroupColor = (bg?: string) => {
    if (!bg) return 'bg-gray-100 text-gray-600 border-gray-200';
    return 'bg-rose-50 text-rose-700 border-rose-200';
  };

  const activeReminders = pillReminders.filter((r: any) => r.status === 'Active');

  // Load corporate list on mount when editing (so it's instant when user opens edit mode)
  const [corporates, setCorporates] = useState<any[]>([]);
  useEffect(() => {
    if (!isEditing) return;
    getCorporateMasters().then(r => { if (r.success) setCorporates(r.data as any[]); });
  }, [isEditing]);

  const currentPatientType = (draft?.patient_type ?? patient.patient_type ?? 'cash').toLowerCase();
  const selectedCorpId = draft?.corporate_id ?? patient.corporate_id ?? '';
  const selectedCorp = corporates.find(c => c.id === selectedCorpId) || patient.corporate;

  const patientTypeLabel = (t: string) => {
    if (t === 'corporate') return 'Corporate';
    if (t === 'tpa_insurance') return 'TPA / Insurance';
    return 'Cash / Self-Pay';
  };
  const patientTypeBadgeCls = (t: string) => {
    if (t === 'corporate') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (t === 'tpa_insurance') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  // Shortcut: render an EditableField with shared props
  const F = (props: Omit<React.ComponentProps<typeof EditableField>, 'isEditing' | 'draft' | 'onChange'>) => (
    <EditableField {...props} isEditing={isEditing} draft={draft} onChange={onDraftChange} />
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT COLUMN */}
      <div className="space-y-6">
        {/* Demographics */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-600" />
            Demographics
          </h3>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-11 w-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <User className="h-6 w-6 text-indigo-600" />
            </span>
            <div className="flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={draft?.full_name ?? ''}
                  onChange={(e) => onDraftChange?.('full_name', e.target.value)}
                  placeholder="Full name"
                  className="w-full text-lg font-black text-gray-900 bg-white border border-emerald-200 rounded-md px-2 py-1"
                />
              ) : (
                <p className="text-lg font-black text-gray-900">{patient.full_name || 'N/A'}</p>
              )}
              <p className="text-xs text-gray-500 font-semibold">{patient.patient_id}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Age" field="age" value={patient.age ? `${patient.age} years` : 'N/A'} type="text" placeholder="e.g. 35" />
            <F label="Gender" field="gender" value={patient.gender || 'N/A'} type="select" options={['Male', 'Female', 'Other']} />
            <F label="Date of Birth" field="date_of_birth" value={fmtDate(patient.date_of_birth)} type="date" />
            {isEditing ? (
              <F label="Blood Group" field="blood_group" value={patient.blood_group || ''} type="select" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} />
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Blood Group</p>
                <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-bold border ${bloodGroupColor(patient.blood_group)}`}>
                  {patient.blood_group || 'N/A'}
                </span>
              </div>
            )}
            {/* Department is read-only — derived from appointments, not user-editable */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Department</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{patient.department || 'General'}</p>
            </div>
            <F label="Aadhar Card" field="aadhar_card" value={patient.aadhar_card || 'N/A'} placeholder="XXXX-XXXX-XXXX" />
            <F label="ABHA Number" field="abha_number" value={patient.abha_number || 'N/A'} placeholder="14-digit ABHA" />
            <F label="PAN Number" field="pan_number" value={patient.pan_number || 'N/A'} placeholder="ABCDE1234F" />
            {/* Registration date is system-generated — always read-only */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Registration Date</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{fmtDate(patient.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Phone className="h-5 w-5 text-orange-600" />
            Contact Information
          </h3>
          <div className="space-y-3">
            <F label="Phone" field="phone" value={patient.phone || 'N/A'} placeholder="10-digit mobile" />
            <F label="Email" field="email" value={patient.email || 'N/A'} placeholder="name@example.com" />
            <F label="Address" field="address" value={patient.address || 'N/A'} type="textarea" placeholder="Street, City, PIN" />
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-600" />
            Emergency Contact
          </h3>
          <div className="space-y-3">
            <F label="Name" field="emergency_contact_name" value={patient.emergency_contact_name || 'N/A'} />
            <F label="Phone" field="emergency_contact_phone" value={patient.emergency_contact_phone || 'N/A'} placeholder="10-digit mobile" />
            <F label="Relation" field="emergency_contact_relation" value={patient.emergency_contact_relation || 'N/A'} placeholder="Spouse / Parent / Sibling" />
          </div>
        </div>

        {/* Billing / Payer */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Billing / Payer
          </h3>
          {isEditing ? (
            <div className="space-y-3">
              <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-3">
                <label className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide block mb-1">Patient Type</label>
                <select
                  value={draft?.patient_type ?? 'cash'}
                  onChange={e => {
                    const v = e.target.value;
                    onDraftChange?.('patient_type', v);
                    // Clear corporate fields when switching away from corporate
                    if (v !== 'corporate') {
                      onDraftChange?.('corporate_id', '');
                      onDraftChange?.('corporate_card_number', '');
                      onDraftChange?.('employee_id', '');
                    }
                  }}
                  className="w-full text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-md px-2 py-1"
                >
                  <option value="cash">Cash / Self-Pay</option>
                  <option value="corporate">Corporate</option>
                  <option value="tpa_insurance">TPA / Insurance</option>
                </select>
              </div>

              {/* Corporate fields — show when type is corporate */}
              {currentPatientType === 'corporate' && (
                <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Corporate Details</span>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide block mb-1">Company *</label>
                    <select
                      value={draft?.corporate_id ?? ''}
                      onChange={e => onDraftChange?.('corporate_id', e.target.value)}
                      className="w-full text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-md px-2 py-1"
                    >
                      <option value="">— Select Company —</option>
                      {corporates.map(c => (
                        <option key={c.id} value={c.id}>{c.company_name} ({c.company_code})</option>
                      ))}
                    </select>
                    {selectedCorp && (
                      <p className="text-[10px] text-blue-600 font-bold ml-1 mt-1">
                        Discount: {Number(selectedCorp.discount_percentage || 0)}%
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide block mb-1">Employee ID</label>
                    <input
                      value={draft?.employee_id ?? ''}
                      onChange={e => onDraftChange?.('employee_id', e.target.value)}
                      placeholder="EMP-001"
                      className="w-full text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-md px-2 py-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide block mb-1">Corporate Card Number</label>
                    <input
                      value={draft?.corporate_card_number ?? ''}
                      onChange={e => onDraftChange?.('corporate_card_number', e.target.value)}
                      placeholder="Card / ID number (optional)"
                      className="w-full text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-md px-2 py-1"
                    />
                  </div>
                </div>
              )}

              {/* TPA — read-only note, edit via Insurance Policies section below */}
              {currentPatientType === 'tpa_insurance' && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3">
                  <p className="text-[11px] text-amber-700 font-semibold">
                    Patient flagged as TPA / Insurance. Manage policy details (provider, policy number, validity) via the Insurance Policies section on the right — edit individual policies there.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Patient Type</p>
                  <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-bold border ${patientTypeBadgeCls(currentPatientType)}`}>
                    {patientTypeLabel(currentPatientType)}
                  </span>
                </div>
              </div>
              {patient.corporate && (
                <>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Corporate Company</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">
                      {patient.corporate.company_name} {patient.corporate.company_code ? `(${patient.corporate.company_code})` : ''}
                    </p>
                    {patient.corporate.discount_percentage != null && (
                      <p className="text-[10px] text-blue-600 font-bold mt-0.5">Discount: {Number(patient.corporate.discount_percentage)}%</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Employee ID</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{patient.employee_id || 'N/A'}</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Card Number</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{patient.corporate_card_number || 'N/A'}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-6">
        {/* Medical Info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Heart className="h-5 w-5 text-rose-600" />
            Medical Information
          </h3>

          {/* Allergies */}
          <div className="mb-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Allergies</p>
            {isEditing ? (
              <input
                type="text"
                value={draft?.allergies ?? ''}
                onChange={(e) => onDraftChange?.('allergies', e.target.value)}
                placeholder="Comma-separated, e.g. Penicillin, Peanuts"
                className="w-full text-sm font-medium text-gray-800 bg-white border border-emerald-200 rounded-md px-2 py-1.5"
              />
            ) : patient.allergies ? (
              <div className="flex flex-wrap gap-1.5">
                {String(patient.allergies).split(',').map((a: string, i: number) => (
                  <span key={i} className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-xs font-bold">
                    {a.trim()}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 font-medium">None recorded</p>
            )}
          </div>

          {/* Chronic Conditions */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Chronic Conditions
            </p>
            {isEditing ? (
              <input
                type="text"
                value={draft?.chronic_conditions ?? ''}
                onChange={(e) => onDraftChange?.('chronic_conditions', e.target.value)}
                placeholder="Comma-separated, e.g. Diabetes, Hypertension"
                className="w-full text-sm font-medium text-gray-800 bg-white border border-emerald-200 rounded-md px-2 py-1.5"
              />
            ) : patient.chronic_conditions ? (
              <div className="flex flex-wrap gap-1.5">
                {String(patient.chronic_conditions).split(',').map((c: string, i: number) => (
                  <span key={i} className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-bold">
                    {c.trim()}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 font-medium">None recorded</p>
            )}
          </div>
        </div>

        {/* Insurance Policies */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Insurance Policies
          </h3>
          {insurancePolicies.length > 0 ? (
            <div className="space-y-4">
              {insurancePolicies.map((policy: any, idx: number) => {
                const coverageLimit = Number(policy.coverage_limit || 0);
                const remainingLimit = Number(policy.remaining_limit || 0);
                const ratio = coverageLimit > 0 ? (remainingLimit / coverageLimit) * 100 : 0;
                const statusNorm = (policy.status || '').toLowerCase();
                const statusCls =
                  statusNorm === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200';

                return (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-800">
                        {policy.provider?.provider_name || 'Unknown Provider'}
                      </p>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCls}`}
                      >
                        {policy.status || 'Unknown'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>
                        <span className="text-gray-400 font-semibold">Policy #:</span>{' '}
                        {policy.policy_number || 'N/A'}
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold">Plan:</span>{' '}
                        {policy.plan_name || 'N/A'}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>
                        <span className="text-gray-400 font-semibold">Coverage:</span>{' '}
                        {'\u20B9'}{coverageLimit.toLocaleString('en-IN')}
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold">Remaining:</span>{' '}
                        {'\u20B9'}{remainingLimit.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-orange-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(ratio, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 text-right font-semibold">
                      {ratio.toFixed(1)}% remaining
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 font-medium">No insurance policies on file</p>
          )}
        </div>

        {/* Active Medications */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Pill className="h-5 w-5 text-emerald-600" />
            Active Medications
          </h3>
          {activeReminders.length > 0 ? (
            <div className="space-y-3">
              {activeReminders.map((reminder: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-800">
                      {reminder.medication_name || 'Unknown Medication'}
                    </p>
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    <span className="text-gray-400 font-semibold">Dosage:</span>{' '}
                    {reminder.dosage || 'N/A'}
                  </p>
                  {reminder.schedule_times && (
                    <div className="flex flex-wrap gap-1.5">
                      {(Array.isArray(reminder.schedule_times)
                        ? reminder.schedule_times
                        : String(reminder.schedule_times).split(',')
                      ).map((time: string, tIdx: number) => (
                        <span
                          key={tIdx}
                          className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3" />
                          {String(time).trim()}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    {fmtDate(reminder.start_date)} — {fmtDate(reminder.end_date)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 font-medium">No active medications</p>
          )}
        </div>
      </div>
    </div>
  );
}
