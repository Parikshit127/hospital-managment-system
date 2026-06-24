'use client';

/**
 * components/booking/DoctorCard.tsx
 * =====================================================================
 * Track B — Step 4 UI: Doctor selection card
 *
 * Pure presentation component. All data and interaction callbacks
 * come from props — no API calls inside (FR-4.1 enforced at API layer).
 *
 * Design: enterprise-grade, high-contrast, scannability-first.
 * Doctor name and specialty are the most visually dominant elements.
 * =====================================================================
 */

import { User, Clock, IndianRupee, Stethoscope, CheckCircle2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DoctorCardData {
  id: string;
  name: string;
  specialty: string;
  consultationFee: number;
  workingHours: string;
  workingDays: string | null;
}

interface DoctorCardProps {
  doctor: DoctorCardData;
  /** 1-based index — used for voice reading ("Doctor 1", "Doctor 2"...) */
  index: number;
  isSelected: boolean;
  /** True while a downstream API call (e.g. slot fetch) is in flight */
  isDisabled?: boolean;
  isLoading?: boolean;
  onSelect: (doctor: DoctorCardData) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Specialty → colour mapping (enterprise blues palette)
// ─────────────────────────────────────────────────────────────────────────────
const SPECIALTY_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  Cardiology:       { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  Neurology:        { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  Orthopedics:      { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  Gastroenterology: { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200' },
  Pulmonology:      { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200' },
  Dermatology:      { bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200' },
  Gynecology:       { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200' },
  Pediatrics:       { bg: 'bg-lime-50',    text: 'text-lime-700',    border: 'border-lime-200' },
  Psychiatry:       { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  Ophthalmology:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200' },
  ENT:              { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
  Urology:          { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  Endocrinology:    { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  Nephrology:       { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  Oncology:         { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200' },
};

function getSpecialtyColour(specialty: string) {
  return SPECIALTY_COLOURS[specialty] ?? { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DoctorCard({
  doctor,
  index,
  isSelected,
  isDisabled = false,
  isLoading = false,
  onSelect,
}: DoctorCardProps) {
  const colour = getSpecialtyColour(doctor.specialty);
  const disabled = isDisabled || isLoading;

  const handleClick = () => {
    if (!disabled) onSelect(doctor);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={isSelected}
      aria-label={`Doctor ${index}: ${doctor.name}, ${doctor.specialty}`}
      className={[
        // Layout
        'w-full text-left rounded-2xl border-2 p-5 transition-all duration-200',
        // Interaction
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        // States
        isSelected
          ? 'border-blue-600 bg-blue-50 shadow-md shadow-blue-100'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm',
        disabled && !isSelected
          ? 'opacity-60 cursor-not-allowed'
          : 'cursor-pointer',
      ].join(' ')}
    >
      {/* Header row: index badge + selected check */}
      <div className="flex items-start justify-between gap-3 mb-3">
        {/* Index badge — for voice reference ("Choose Doctor 1") */}
        <span
          className={[
            'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0',
            isSelected
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-500',
          ].join(' ')}
          aria-hidden="true"
        >
          {index}
        </span>

        {isSelected && (
          <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
        )}
      </div>

      {/* Doctor name — most prominent element (scannability-first) */}
      <div className="flex items-center gap-2 mb-1">
        <User className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
        <p className={[
          'text-lg font-bold leading-tight truncate',
          isSelected ? 'text-blue-900' : 'text-gray-900',
        ].join(' ')}>
          {doctor.name.toLowerCase().startsWith('dr') ? doctor.name : `Dr. ${doctor.name}`}
        </p>
      </div>

      {/* Specialty badge — second most prominent */}
      <div className="mb-4 pl-6">
        <span
          className={[
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
            colour.bg, colour.text, colour.border,
          ].join(' ')}
        >
          <Stethoscope className="w-3 h-3" aria-hidden="true" />
          {doctor.specialty}
        </span>
      </div>

      {/* Details row */}
      <div className="flex items-center justify-between gap-2 text-sm text-gray-500">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          <span>{doctor.workingHours}</span>
        </span>
        {doctor.consultationFee > 0 && (
          <span className="flex items-center gap-1 font-semibold text-gray-700">
            <IndianRupee className="w-3.5 h-3.5" aria-hidden="true" />
            {doctor.consultationFee.toLocaleString('en-IN')}
          </span>
        )}
      </div>

      {/* Working days */}
      {doctor.workingDays && (
        <p className="mt-1.5 text-xs text-gray-400 pl-0">
          Available: {doctor.workingDays}
        </p>
      )}

      {/* Loading overlay */}
      {isLoading && isSelected && (
        <div className="mt-3 flex items-center gap-2 text-xs text-blue-600">
          <span
            className="inline-block w-3 h-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"
            aria-hidden="true"
          />
          Loading slots…
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// List wrapper — renders a grid of DoctorCards with an empty state
// ─────────────────────────────────────────────────────────────────────────────

interface DoctorCardListProps {
  doctors: DoctorCardData[];
  selectedDoctorId: string | null;
  isDisabled?: boolean;
  loadingDoctorId?: string | null;
  onSelect: (doctor: DoctorCardData) => void;
  /** Shown when doctors array is empty */
  emptyMessage?: string;
}

export function DoctorCardList({
  doctors,
  selectedDoctorId,
  isDisabled = false,
  loadingDoctorId,
  onSelect,
  emptyMessage = 'No doctors found for this specialty.',
}: DoctorCardListProps) {
  if (doctors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Stethoscope className="w-6 h-6 text-gray-400" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-gray-600">{emptyMessage}</p>
        <p className="text-xs text-gray-400 mt-1">
          Please describe your symptoms again or choose a department from the list.
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      role="list"
      aria-label="Available doctors"
    >
      {doctors.map((doctor, i) => (
        <div key={doctor.id} role="listitem">
          <DoctorCard
            doctor={doctor}
            index={i + 1}
            isSelected={selectedDoctorId === doctor.id}
            isDisabled={isDisabled}
            isLoading={loadingDoctorId === doctor.id}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  );
}
