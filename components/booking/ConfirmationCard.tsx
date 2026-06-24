'use client';

/**
 * components/booking/ConfirmationCard.tsx
 * =====================================================================
 * Track B — Step 6 UI: Booking confirmation display
 *
 * Pure presentation component. Shown after a successful appointment
 * creation. Must clearly communicate:
 *   1. Booking is confirmed (visual success state)
 *   2. The appointment ID (for patient reference)
 *   3. Doctor + date + time
 *   4. Next steps (portal link, set password)
 * =====================================================================
 */

import { CheckCircle2, CalendarDays, User, Stethoscope, Hash, ArrowRight, Phone } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmationCardProps {
  appointmentId: string;
  doctorName: string;
  specialty: string;
  /** ISO datetime string */
  appointmentDate: string;
  patientName: string;
  patientId: string;
  organisationName?: string;
  /** If provided, renders a "View My Appointments" button */
  onGoToPortal?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatAppointmentDate(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      time: d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    };
  } catch {
    return { date: iso, time: '' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail row sub-component
// ─────────────────────────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-none mb-0.5">
          {label}
        </p>
        <p className="text-sm font-semibold text-gray-900 leading-snug break-words">
          {value}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmationCard Component
// ─────────────────────────────────────────────────────────────────────────────

export function ConfirmationCard({
  appointmentId,
  doctorName,
  specialty,
  appointmentDate,
  patientName,
  patientId,
  organisationName,
  onGoToPortal,
}: ConfirmationCardProps) {
  const { date, time } = formatAppointmentDate(appointmentDate);

  return (
    <div
      className="w-full max-w-md mx-auto rounded-2xl overflow-hidden shadow-lg shadow-blue-100/60 border border-blue-100"
      role="region"
      aria-label="Appointment confirmation"
    >
      {/* ── Success header ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-6 text-white text-center">
        {/* Animated check icon */}
        <div className="flex items-center justify-center mb-3">
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-white" aria-hidden="true" />
            </div>
            {/* Ripple rings */}
            <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" aria-hidden="true" />
          </div>
        </div>

        <h2 className="text-xl font-black tracking-tight">Appointment Booked!</h2>
        <p className="text-blue-200 text-sm mt-1">
          {patientName ? `Hi ${patientName.split(' ')[0]}, your` : 'Your'} appointment is confirmed.
        </p>

        {/* Appointment ID — prominent reference number */}
        <div className="mt-4 inline-flex items-center gap-2 bg-white/15 rounded-xl px-4 py-2">
          <Hash className="w-3.5 h-3.5 text-blue-200" aria-hidden="true" />
          <span className="text-xs text-blue-200 font-medium">Appointment ID</span>
          <span className="text-sm text-white font-bold font-mono tracking-wide">
            {appointmentId}
          </span>
        </div>
      </div>

      {/* ── Detail rows ─────────────────────────────────────────────────────── */}
      <div className="bg-white px-6 py-1">
        <DetailRow
          icon={<User className="w-4 h-4 text-blue-600" aria-hidden="true" />}
          label="Doctor"
          value={`Dr. ${doctorName}`}
        />
        <DetailRow
          icon={<Stethoscope className="w-4 h-4 text-blue-600" aria-hidden="true" />}
          label="Specialty"
          value={specialty}
        />
        <DetailRow
          icon={<CalendarDays className="w-4 h-4 text-blue-600" aria-hidden="true" />}
          label="Date"
          value={date}
        />
        {time && (
          <DetailRow
            icon={
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <polyline points="12 6 12 12 16 14" strokeWidth="2" strokeLinecap="round" />
              </svg>
            }
            label="Time"
            value={time}
          />
        )}
        {organisationName && (
          <DetailRow
            icon={
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeWidth="2" />
                <polyline points="9 22 9 12 15 12 15 22" strokeWidth="2" />
              </svg>
            }
            label="Hospital"
            value={organisationName}
          />
        )}
      </div>

      {/* ── Payment notice ─────────────────────────────────────────────────── */}
      <div className="bg-amber-50 border-t border-amber-100 px-6 py-3">
        <div className="flex items-start gap-2">
          <Phone className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-amber-700 leading-snug">
            <strong>Pay at Visit</strong> — Please arrive 15 minutes early and pay the consultation
            fee at the reception desk. Your Patient ID is <span className="font-mono font-bold">{patientId}</span>.
          </p>
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <div className="bg-white px-6 py-5 space-y-3">
        {onGoToPortal && (
          <button
            type="button"
            onClick={onGoToPortal}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 active:scale-[0.98] transition-all"
          >
            View My Appointments
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        <p className="text-center text-xs text-gray-400">
          A confirmation has been sent to your registered email and phone.
        </p>
      </div>
    </div>
  );
}
