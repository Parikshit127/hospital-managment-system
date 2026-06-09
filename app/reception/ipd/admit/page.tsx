'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserPlus, ArrowLeft, Search, X, Bed, User, Phone,
  Stethoscope, FileText, Loader2, AlertCircle, CheckCircle,
  ChevronDown, CreditCard, Building2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/app/components/layout/AppShell';
import {
  searchPatientsForAdmission,
  getWardsWithBeds,
  admitPatientIPD,
} from '@/app/actions/ipd-actions';
import { getActiveDoctors } from '@/app/actions/doctor-list-actions';

// ── Types ──────────────────────────────────────────────────────────────────────

type PatientResult = {
  id: string;
  patient_id: string;
  full_name: string;
  age: string | null;
  gender: string | null;
  phone: string | null;
};

type Bed = {
  bed_id: string;
  bed_type: string | null;
  status: string;
  ward_id: number;
};

type Ward = {
  id: number;
  ward_id: number;
  ward_name: string;
  ward_type: string;
  cost_per_day: number;
  beds: Bed[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const labelClass =
  'text-[11px] font-bold text-gray-500 uppercase tracking-widest';

const inputClass =
  'w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10 outline-none transition-all';

const selectClass = `${inputClass} appearance-none`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdmitPatientPage() {
  const router = useRouter();

  // Patient search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Wards & beds
  const [wards, setWards] = useState<Ward[]>([]);
  const [isLoadingWards, setIsLoadingWards] = useState(true);
  const [selectedWardId, setSelectedWardId] = useState<number | ''>('');
  const [selectedBedId, setSelectedBedId] = useState<string>('');

  // Doctors list
  const [doctors, setDoctors] = useState<{ id: string; name: string | null; specialty: string | null }[]>([]);

  // Admission details
  const [doctorName, setDoctorName] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [admissionType, setAdmissionType] = useState<'Elective' | 'Emergency'>('Elective');

  // Deposit
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositMethod, setDepositMethod] = useState<string>('Cash');

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Load wards on mount ───────────────────────────────────────────────────

  useEffect(() => {
    getWardsWithBeds().then((res) => {
      if (res.success && res.data) {
        setWards(res.data as Ward[]);
      }
      setIsLoadingWards(false);
    });
    getActiveDoctors().then((res) => {
      if (res.success && res.data) {
        setDoctors(res.data as { id: string; name: string | null; specialty: string | null }[]);
      }
    });
  }, []);

  // ── Patient search debounce ───────────────────────────────────────────────

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSelectedBedId('');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      const res = await searchPatientsForAdmission(value.trim());
      setIsSearching(false);
      if (res.success && res.data) {
        setSearchResults(res.data as PatientResult[]);
        setShowDropdown(true);
      }
    }, 300);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedWard = wards.find((w) => w.id === selectedWardId) ?? null;
  const availableBeds = selectedWard
    ? selectedWard.beds.filter((b) => b.status === 'Available')
    : [];

  const depositNum = parseFloat(depositAmount) || 0;

  const canSubmit =
    !!selectedPatient &&
    !!selectedBedId &&
    doctorName.trim().length > 0 &&
    !isSubmitting;

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedPatient || !selectedWardId) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: Parameters<typeof admitPatientIPD>[0] = {
      patient_id: selectedPatient.patient_id,
      bed_id: selectedBedId,
      ward_id: selectedWardId as number,
      diagnosis: diagnosis.trim(),
      doctor_name: doctorName.trim(),
      admission_type: admissionType,
      ...(depositNum > 0 && {
        deposit_amount: depositNum,
        deposit_payment_method: depositMethod,
      }),
    };

    const result = await admitPatientIPD(payload);

    if (result.success && result.data) {
      router.push(`/reception/ipd/${(result.data as any).admission_id}`);
    } else {
      setErrorMessage((result as any).error ?? 'Admission failed. Please try again.');
      setIsSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell pageTitle="IPD" pageIcon={<Bed className="h-5 w-5" />}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/reception/ipd')}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-50 rounded-xl">
                <UserPlus className="h-5 w-5 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900">
                Admit Patient
              </h1>
            </div>
            <p className="text-sm text-gray-500 font-medium mt-0.5 ml-11">
              Search for a patient and assign a ward bed
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── 1. Patient Search ─────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400 rounded-t-2xl" />
            <div className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <User className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
                  Patient
                </span>
              </div>

              {selectedPatient ? (
                /* Selected patient card */
                <div className="flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="h-11 w-11 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-xl flex items-center justify-center text-white font-black text-lg shrink-0">
                    {selectedPatient.full_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-900 text-sm">
                      {selectedPatient.full_name}
                    </p>
                    <p className="text-xs font-mono text-emerald-700 mt-0.5">
                      {selectedPatient.patient_id}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[
                        selectedPatient.age ? `${selectedPatient.age}y` : null,
                        selectedPatient.gender,
                        selectedPatient.phone,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition-all"
                  >
                    Change
                  </button>
                </div>
              ) : (
                /* Search input + dropdown */
                <div ref={searchRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    {isSearching && (
                      <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />
                    )}
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                      placeholder="Search by name, phone, or patient ID"
                      className={`${inputClass} pl-11 pr-11`}
                      autoComplete="off"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                          setShowDropdown(false);
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {showDropdown && searchResults.length > 0 && (
                    <div className="absolute z-20 top-full mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                      {searchResults.map((p) => (
                        <button
                          key={p.patient_id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p);
                            setShowDropdown(false);
                            setSearchQuery('');
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 transition-colors text-left border-b border-gray-100 last:border-0"
                        >
                          <div className="h-9 w-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center text-white font-black text-sm shrink-0">
                            {p.full_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">
                              {p.full_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              <span className="font-mono text-emerald-600 mr-2">
                                {p.patient_id}
                              </span>
                              {[
                                p.age ? `${p.age}y` : null,
                                p.gender,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          {p.phone && (
                            <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                              <Phone className="h-3 w-3" />
                              {p.phone}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {showDropdown && searchResults.length === 0 && !isSearching && searchQuery.trim().length >= 2 && (
                    <div className="absolute z-20 top-full mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-6 text-center">
                      <p className="text-sm text-gray-500 font-medium">
                        No patients found for &quot;{searchQuery}&quot;
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Try searching by phone number or patient ID
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── 2. Ward & Bed Selection ───────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
                Ward &amp; Bed
              </span>
            </div>

            {isLoadingWards ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                Loading wards...
              </div>
            ) : (
              <div className="space-y-5">
                {/* Ward dropdown */}
                <div className="space-y-1.5">
                  <label className={labelClass}>Ward *</label>
                  <div className="relative">
                    <select
                      value={selectedWardId}
                      onChange={(e) => {
                        setSelectedWardId(e.target.value ? Number(e.target.value) : '');
                        setSelectedBedId('');
                      }}
                      className={selectClass}
                    >
                      <option value="">Select a ward</option>
                      {wards.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.ward_name} — {w.ward_type} · ₹{w.cost_per_day.toLocaleString('en-IN')}/day
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  </div>
                </div>

                {/* Bed grid */}
                {selectedWardId !== '' && (
                  <div className="space-y-2">
                    <label className={labelClass}>Available Beds *</label>
                    {availableBeds.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        No beds available in this ward
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                        {availableBeds.map((bed) => (
                          <button
                            key={bed.bed_id}
                            type="button"
                            onClick={() => setSelectedBedId(bed.bed_id)}
                            className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 text-center transition-all ${
                              selectedBedId === bed.bed_id
                                ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-500/10'
                                : 'border-gray-200 bg-gray-50 hover:border-emerald-300 hover:bg-emerald-50/50'
                            }`}
                          >
                            <Bed
                              className={`h-5 w-5 ${
                                selectedBedId === bed.bed_id
                                  ? 'text-emerald-600'
                                  : 'text-gray-400'
                              }`}
                            />
                            <span
                              className={`text-xs font-black leading-tight ${
                                selectedBedId === bed.bed_id
                                  ? 'text-emerald-700'
                                  : 'text-gray-600'
                              }`}
                            >
                              {bed.bed_id}
                            </span>
                            {bed.bed_type && (
                              <span className="text-[10px] font-medium text-gray-400 leading-tight">
                                {bed.bed_type}
                              </span>
                            )}
                            {selectedBedId === bed.bed_id && (
                              <CheckCircle className="h-3 w-3 text-emerald-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 3. Admission Details ──────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Stethoscope className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
                Admission Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Doctor name */}
              <div className="space-y-1.5">
                <label className={labelClass}>Doctor Name *</label>
                <div className="relative">
                  <Stethoscope className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <select
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className={`${selectClass} pl-11`}
                    required
                  >
                    <option value="">Select attending physician</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.name ?? ''}>
                        {d.name}{d.specialty ? ` — ${d.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              {/* Admission type */}
              <div className="space-y-1.5">
                <label className={labelClass}>Admission Type *</label>
                <div className="relative">
                  <select
                    value={admissionType}
                    onChange={(e) =>
                      setAdmissionType(e.target.value as 'Elective' | 'Emergency')
                    }
                    className={selectClass}
                  >
                    <option value="Elective">Elective</option>
                    <option value="Emergency">Emergency</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              {/* Diagnosis */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className={labelClass}>Diagnosis <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="relative">
                  <FileText className="absolute left-4 top-4 h-4 w-4 text-gray-400" />
                  <textarea
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="Primary diagnosis / chief complaint"
                    rows={3}
                    className="w-full bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10 outline-none transition-all resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── 4. Deposit ────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <CreditCard className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
                Deposit
              </span>
              <span className="text-[10px] font-medium text-gray-400 normal-case tracking-normal ml-1">
                (Optional)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className={labelClass}>Deposit Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0"
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </div>

              {depositNum > 0 && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Payment Method</label>
                  <div className="relative">
                    <select
                      value={depositMethod}
                      onChange={(e) => setDepositMethod(e.target.value)}
                      className={selectClass}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="NEFT_RTGS">NEFT/RTGS</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {errorMessage && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-red-700">{errorMessage}</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <button
              type="button"
              onClick={() => router.push('/reception/ipd')}
              className="px-5 py-3 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Admitting...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Admit Patient
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
