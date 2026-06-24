'use client';

/**
 * components/booking/SlotCard.tsx
 * =====================================================================
 * Track B — Step 5 UI: Appointment time slot selection card
 *
 * Pure presentation component. All data and interaction via props.
 * Time is the dominant visual element — the patient must be able to
 * identify slots at a glance or hear them read aloud accurately.
 * =====================================================================
 */

import { Clock, CheckCircle2, CalendarDays } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotCardData {
  id: string;
  startTime: string; // "09:00"
  endTime: string;   // "09:30"
  date: string;      // ISO date string
}

interface SlotCardProps {
  slot: SlotCardData;
  /** 1-based index — for voice reference ("Slot 1", "Slot 2"...) */
  index: number;
  isSelected: boolean;
  isDisabled?: boolean;
  onSelect: (slot: SlotCardData) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert "09:00" to "9:00 AM" */
function formatTime(time: string): string {
  const [hourStr, min] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${min} ${period}`;
}

/** Determine the time-of-day period for a visual label */
function getTimePeriod(time: string): { label: string; dotClass: string } {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 12) return { label: 'Morning', dotClass: 'bg-amber-400' };
  if (hour < 17) return { label: 'Afternoon', dotClass: 'bg-blue-400' };
  return { label: 'Evening', dotClass: 'bg-indigo-400' };
}

// ─────────────────────────────────────────────────────────────────────────────
// SlotCard Component
// ─────────────────────────────────────────────────────────────────────────────

export function SlotCard({ slot, index, isSelected, isDisabled = false, onSelect }: SlotCardProps) {
  const { label: periodLabel, dotClass } = getTimePeriod(slot.startTime);

  return (
    <button
      type="button"
      onClick={() => !isDisabled && onSelect(slot)}
      disabled={isDisabled}
      aria-pressed={isSelected}
      aria-label={`Slot ${index}: ${formatTime(slot.startTime)} to ${formatTime(slot.endTime)}, ${periodLabel}`}
      className={[
        'relative w-full rounded-xl border-2 p-3.5 text-left transition-all duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
        isSelected
          ? 'border-blue-600 bg-blue-600 shadow-md shadow-blue-200'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40',
        isDisabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer',
      ].join(' ')}
    >
      {/* Index badge */}
      <span
        className={[
          'absolute top-2 right-2 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center',
          isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400',
        ].join(' ')}
        aria-hidden="true"
      >
        {index}
      </span>

      {/* Time — dominant element */}
      <div className="flex items-baseline gap-1 mb-1">
        <Clock
          className={['w-3.5 h-3.5 mt-0.5 flex-shrink-0', isSelected ? 'text-blue-200' : 'text-gray-400'].join(' ')}
          aria-hidden="true"
        />
        <span className={[
          'text-base font-bold tabular-nums tracking-tight',
          isSelected ? 'text-white' : 'text-gray-900',
        ].join(' ')}>
          {formatTime(slot.startTime)}
        </span>
        <span className={['text-xs', isSelected ? 'text-blue-200' : 'text-gray-400'].join(' ')}>
          – {formatTime(slot.endTime)}
        </span>
      </div>

      {/* Period label */}
      <div className="flex items-center gap-1.5 pl-5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? 'bg-blue-200' : dotClass}`} aria-hidden="true" />
        <span className={['text-xs font-medium', isSelected ? 'text-blue-200' : 'text-gray-500'].join(' ')}>
          {periodLabel}
        </span>
      </div>

      {/* Selected check */}
      {isSelected && (
        <CheckCircle2
          className="absolute bottom-2 right-2 w-4 h-4 text-blue-200"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SlotCardList — renders all slots grouped by time period, with empty state
// ─────────────────────────────────────────────────────────────────────────────

interface SlotCardListProps {
  slots: SlotCardData[];
  date: string;
  selectedSlotId: string | null;
  isDisabled?: boolean;
  onSelect: (slot: SlotCardData) => void;
  /** Shown when slots array is empty */
  nextAvailableDate?: string | null;
  onTryNextDate?: (date: string) => void;
}

export function SlotCardList({
  slots,
  date,
  selectedSlotId,
  isDisabled = false,
  onSelect,
  nextAvailableDate,
  onTryNextDate,
}: SlotCardListProps) {
  /** Format an ISO date string to a readable label */
  function formatDateLabel(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    } catch {
      return iso;
    }
  }

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
        <CalendarDays className="w-8 h-8 text-gray-300 mb-2" aria-hidden="true" />
        <p className="text-sm font-semibold text-gray-700">No slots available on this date</p>
        {nextAvailableDate ? (
          <>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Next available: <strong>{formatDateLabel(nextAvailableDate)}</strong>
            </p>
            {onTryNextDate && (
              <button
                type="button"
                onClick={() => onTryNextDate(nextAvailableDate)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
              >
                Show slots for {formatDateLabel(nextAvailableDate)}
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400 mt-1">
            No slots available in the next 7 days. Please try another doctor.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Date header */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
        {formatDateLabel(date)}
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
          {slots.filter((s: any) => s.isAvailable !== false).length} available
        </span>
      </p>

      {/* Responsive grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
        role="list"
        aria-label="Available appointment slots"
      >
        {slots.map((slot, i) => (
          <div key={slot.id} role="listitem">
            <SlotCard
              slot={slot}
              index={i + 1}
              isSelected={selectedSlotId === slot.id}
              isDisabled={isDisabled || (slot as any).isAvailable === false}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
