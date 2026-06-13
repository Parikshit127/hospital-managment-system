'use client';

import React, { useEffect, useState } from 'react';
import { DateField } from '@/app/components/ui/DateField';
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
import { getCorporateMasters, getTpaProviders } from '@/app/actions/patient-type-actions';
import { addPatientPolicy, updatePatientPolicy, deletePatientPolicy } from '@/app/actions/insurance-actions';
import { Plus, Pencil, Trash2, Check, X as XIcon } from 'lucide-react';

interface OverviewTabProps {
  patient: any;
  patientId?: string;
  insurancePolicies: any[];
  pillReminders: any[];
  isEditing?: boolean;
  draft?: Record<string, string>;
  onDraftChange?: (field: string, value: string) => void;
  onPolicyChanged?: () => void;
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
      ) : type === 'date' ? (
        <DateField
          value={v}
          onChange={(e) => handle(e.target.value)}
          placeholder={placeholder}
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
  return new Date(v).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function OverviewTab({ patient, patientId, insurancePolicies, pillReminders, isEditing = false, draft, onDraftChange, onPolicyChanged }: OverviewTabProps) {
  const bloodGroupColor = (bg?: string) => {
    if (!bg) return 'bg-gray-100 text-gray-600 border-gray-200';
    return 'bg-rose-50 text-rose-700 border-rose-200';
  };

  const activeReminders = pillReminders.filter((r: any) => r.status === 'Active');

  // Load corporate list on mount when editing (so it's instant when user opens edit mode)
  const [corporates, setCorporates] = useState<any[]>([]);
  const [tpaProviders, setTpaProviders] = useState<any[]>([]);
  useEffect(() => {
    if (!isEditing) return;
    getCorporateMasters().then(r => { if (r.success) setCorporates(r.data as any[]); });
    getTpaProviders().then(r => { if (r.success) setTpaProviders(r.data as any[]); });
  }, [isEditing]);

  // Policy add/edit state
  const blankPolicyForm = {
    provider_id: '',
    policy_number: '',
    policy_holder: '',
    plan_name: '',
    coverage_limit: '',
    valid_from: '',
    valid_until: '',
  };
  const [editingPolicyId, setEditingPolicyId] = useState<number | null>(null);
  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState(blankPolicyForm);
  const [policyBusy, setPolicyBusy] = useState(false);

  function startAddPolicy() {
    setEditingPolicyId(null);
    setPolicyForm(blankPolicyForm);
    setShowAddPolicy(true);
  }
  function startEditPolicy(p: any) {
    setShowAddPolicy(false);
    setEditingPolicyId(p.id);
    setPolicyForm({
      provider_id: String(p.provider_id ?? ''),
      policy_number: p.policy_number ?? '',
      policy_holder: p.policy_holder ?? '',
      plan_name: p.plan_name ?? '',
      coverage_limit: String(p.coverage_limit ?? ''),
      valid_from: p.valid_from ? new Date(p.valid_from).toISOString().slice(0, 10) : '',
      valid_until: p.valid_until ? new Date(p.valid_until).toISOString().slice(0, 10) : '',
    });
  }
  function cancelPolicyEdit() {
    setShowAddPolicy(false);
    setEditingPolicyId(null);
    setPolicyForm(blankPolicyForm);
  }
  async function savePolicy() {
    if (!patientId) return;
    if (!policyForm.provider_id || !policyForm.policy_number || !policyForm.coverage_limit || !policyForm.valid_from || !policyForm.valid_until) {
      alert('Provider, policy number, coverage limit, valid from and valid until are required');
      return;
    }
    setPolicyBusy(true);
    const payload = {
      patient_id: patientId,
      provider_id: Number(policyForm.provider_id),
      policy_number: policyForm.policy_number.trim(),
      policy_holder: policyForm.policy_holder.trim() || undefined,
      plan_name: policyForm.plan_name.trim() || undefined,
      coverage_limit: Number(policyForm.coverage_limit),
      valid_from: policyForm.valid_from,
      valid_until: policyForm.valid_until,
    };
    const res = editingPolicyId
      ? await updatePatientPolicy(editingPolicyId, payload)
      : await addPatientPolicy(payload);
    setPolicyBusy(false);
    if (res.success) {
      cancelPolicyEdit();
      onPolicyChanged?.();
    } else {
      alert(res.error || 'Failed to save policy');
    }
  }
  async function removePolicy(id: number) {
    if (!confirm('Delete this insurance policy? If claims exist it will be deactivated, otherwise permanently removed.')) return;
    setPolicyBusy(true);
    const res = await deletePatientPolicy(id);
    setPolicyBusy(false);
    if (res.success) {
      onPolicyChanged?.();
    } else {
      alert(res.error || 'Failed to delete policy');
    }
  }

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
            <F label="Nationality" field="nationality" value={patient.nationality || 'N/A'} placeholder="e.g. Indian" />
            <F label="Govt Proof Type" field="govt_id_type" value={patient.govt_id_type || 'N/A'} type="select" options={['Aadhaar', 'PAN', 'Passport', 'Voter ID', 'Driving License']} />
            <F label="Govt Proof Number" field="govt_id_number" value={patient.govt_id_number || 'N/A'} placeholder="ID number" />
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
                      onDraftChange?.('corporate_name', '');
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
                    <input
                      list="corp-company-list"
                      value={draft?.corporate_name ?? (selectedCorp?.company_name ?? '')}
                      onChange={e => onDraftChange?.('corporate_name', e.target.value)}
                      placeholder="Type company name…"
                      className="w-full text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-md px-2 py-1"
                    />
                    <datalist id="corp-company-list">
                      {corporates.map(c => (
                        <option key={c.id} value={c.company_name}>{c.company_code}</option>
                      ))}
                    </datalist>
                    {(() => {
                      const typed = (draft?.corporate_name ?? selectedCorp?.company_name ?? '').trim();
                      if (!typed) return null;
                      const match = corporates.find((c: any) => (c.company_name || '').toLowerCase() === typed.toLowerCase());
                      return match ? (
                        <p className="text-[10px] text-blue-600 font-bold ml-1 mt-1">Discount: {Number(match.discount_percentage || 0)}%</p>
                      ) : (
                        <p className="text-[10px] text-emerald-600 font-bold ml-1 mt-1">New company — will be added to the corporate master on save.</p>
                      );
                    })()}
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-gray-800 text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Insurance Policies
            </h3>
            {isEditing && (
              <button
                onClick={startAddPolicy}
                disabled={policyBusy}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> Add Policy
              </button>
            )}
          </div>

          {/* Add/Edit form */}
          {isEditing && (showAddPolicy || editingPolicyId !== null) && (
            <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-3 mb-3 space-y-2">
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                {editingPolicyId ? 'Edit Policy' : 'Add New Policy'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">TPA / Insurance Provider *</label>
                  <select
                    value={policyForm.provider_id}
                    onChange={e => setPolicyForm({ ...policyForm, provider_id: e.target.value })}
                    className="w-full text-sm bg-white border border-gray-200 rounded-md px-2 py-1"
                  >
                    <option value="">— Select Provider —</option>
                    {tpaProviders.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.provider_name}{p.provider_code ? ` (${p.provider_code})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">TPA Code</label>
                  <input
                    readOnly
                    value={tpaProviders.find((p: any) => String(p.id) === String(policyForm.provider_id))?.provider_code || ''}
                    placeholder="Auto-filled from provider"
                    title="Code of the selected TPA / insurance provider"
                    className="w-full text-sm bg-gray-50 text-gray-600 border border-gray-200 rounded-md px-2 py-1 cursor-default"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Policy Number *</label>
                  <input
                    value={policyForm.policy_number}
                    onChange={e => setPolicyForm({ ...policyForm, policy_number: e.target.value })}
                    placeholder="POL-12345"
                    className="w-full text-sm bg-white border border-gray-200 rounded-md px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Policy Holder</label>
                  <input
                    value={policyForm.policy_holder}
                    onChange={e => setPolicyForm({ ...policyForm, policy_holder: e.target.value })}
                    placeholder="Self / Spouse / …"
                    className="w-full text-sm bg-white border border-gray-200 rounded-md px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Plan Name</label>
                  <input
                    value={policyForm.plan_name}
                    onChange={e => setPolicyForm({ ...policyForm, plan_name: e.target.value })}
                    placeholder="Gold / Silver / …"
                    className="w-full text-sm bg-white border border-gray-200 rounded-md px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Coverage Limit (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    value={policyForm.coverage_limit}
                    onChange={e => setPolicyForm({ ...policyForm, coverage_limit: e.target.value })}
                    placeholder="500000"
                    className="w-full text-sm bg-white border border-gray-200 rounded-md px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Valid From *</label>
                  <DateField
                    value={policyForm.valid_from}
                    onChange={e => setPolicyForm({ ...policyForm, valid_from: e.target.value })}
                    className="w-full text-sm bg-white border border-gray-200 rounded-md px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Valid Until *</label>
                  <DateField
                    value={policyForm.valid_until}
                    onChange={e => setPolicyForm({ ...policyForm, valid_until: e.target.value })}
                    className="w-full text-sm bg-white border border-gray-200 rounded-md px-2 py-1"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={cancelPolicyEdit} disabled={policyBusy} className="px-3 py-1 text-[11px] font-bold text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={savePolicy} disabled={policyBusy} className="px-3 py-1 text-[11px] font-bold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50">
                  {policyBusy ? 'Saving…' : (editingPolicyId ? 'Update Policy' : 'Add Policy')}
                </button>
              </div>
            </div>
          )}

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
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCls}`}
                        >
                          {policy.status || 'Unknown'}
                        </span>
                        {isEditing && (
                          <>
                            <button
                              onClick={() => startEditPolicy(policy)}
                              disabled={policyBusy}
                              title="Edit policy"
                              className="p-1 rounded hover:bg-blue-50 text-blue-600 disabled:opacity-40"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => removePolicy(policy.id)}
                              disabled={policyBusy}
                              title="Delete policy"
                              className="p-1 rounded hover:bg-rose-50 text-rose-600 disabled:opacity-40"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
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
