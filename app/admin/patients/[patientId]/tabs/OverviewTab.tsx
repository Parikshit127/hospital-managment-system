'use client';

import React from 'react';
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
} from 'lucide-react';

interface OverviewTabProps {
  patient: any;
  insurancePolicies: any[];
  pillReminders: any[];
}

const fmtDate = (v?: string | Date | null) => {
  if (!v) return 'N/A';
  return new Date(v).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function OverviewTab({ patient, insurancePolicies, pillReminders }: OverviewTabProps) {
  const bloodGroupColor = (bg?: string) => {
    if (!bg) return 'bg-gray-100 text-gray-600 border-gray-200';
    return 'bg-rose-50 text-rose-700 border-rose-200';
  };

  const activeReminders = pillReminders.filter((r: any) => r.status === 'Active');

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
            <div>
              <p className="text-lg font-black text-gray-900">{patient.full_name || 'N/A'}</p>
              <p className="text-xs text-gray-500 font-semibold">{patient.patient_id}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Age', value: patient.age ? `${patient.age} years` : 'N/A' },
              { label: 'Gender', value: patient.gender || 'N/A' },
              { label: 'Date of Birth', value: fmtDate(patient.date_of_birth) },
              {
                label: 'Blood Group',
                value: patient.blood_group || 'N/A',
                isBadge: true,
              },
              { label: 'Department', value: patient.department || 'General' },
              { label: 'Aadhar Card', value: patient.aadhar_number || 'N/A' },
              { label: 'ABHA Number', value: patient.abha_number || 'N/A' },
              { label: 'PAN Number', value: patient.pan_number || 'N/A' },
              { label: 'Registration Date', value: fmtDate(patient.created_at) },
            ].map((item) => (
              <div key={item.label} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  {item.label}
                </p>
                {item.isBadge ? (
                  <span
                    className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-bold border ${bloodGroupColor(patient.blood_group)}`}
                  >
                    {item.value}
                  </span>
                ) : (
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Phone className="h-5 w-5 text-teal-600" />
            Contact Information
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <Phone className="h-4 w-4 text-teal-600 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Phone</p>
                <p className="text-sm font-semibold text-gray-800">{patient.phone || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <Mail className="h-4 w-4 text-cyan-600 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Email</p>
                <p className="text-sm font-semibold text-gray-800 truncate">{patient.email || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <MapPin className="h-4 w-4 text-violet-600 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Address</p>
                <p className="text-sm font-semibold text-gray-800">{patient.address || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-600" />
            Emergency Contact
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Name', value: patient.emergency_contact_name || 'N/A' },
              { label: 'Phone', value: patient.emergency_contact_phone || 'N/A' },
              { label: 'Relation', value: patient.emergency_contact_relation || 'N/A' },
            ].map((item) => (
              <div key={item.label} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  {item.label}
                </p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
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
            {patient.allergies ? (
              <div className="flex flex-wrap gap-1.5">
                {String(patient.allergies)
                  .split(',')
                  .map((a: string, i: number) => (
                    <span
                      key={i}
                      className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-xs font-bold"
                    >
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
            {patient.chronic_conditions ? (
              <div className="flex flex-wrap gap-1.5">
                {String(patient.chronic_conditions)
                  .split(',')
                  .map((c: string, i: number) => (
                    <span
                      key={i}
                      className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-bold"
                    >
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
                        className="bg-teal-500 h-2 rounded-full transition-all"
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
