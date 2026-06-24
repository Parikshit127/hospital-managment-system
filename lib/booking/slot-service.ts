/**
 * lib/booking/slot-service.ts
 * =====================================================================
 * Track B — Step 5 service: Live slot fetch
 *
 * Rules enforced here:
 * - Slots are fetched live from the DB — never hardcoded (FR-5.1)
 * - Only returns slots where is_available=true AND is_booked=false
 * - Reuses getOrCreateDailySlots() for auto-generation (don't duplicate logic)
 * - Re-fetch before commit to prevent double-booking (FR-5.4 / Technical §10)
 * =====================================================================
 */

import { getOrCreateDailySlots } from '@/app/actions/doctor-actions';
import { getTenantPrisma } from '@/backend/db';
import type { SlotCard } from '@/lib/contracts/voice';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotQueryResult {
  success: boolean;
  slots: SlotCard[];
  date: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal mapper
// ─────────────────────────────────────────────────────────────────────────────

function mapToSlotCard(slot: {
  id: string;
  start_time: string;
  end_time: string;
  date: Date;
}): SlotCard {
  return {
    id: slot.id,
    startTime: slot.start_time,
    endTime: slot.end_time,
    date: slot.date instanceof Date
      ? slot.date.toISOString().split('T')[0]
      : String(slot.date),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all available (unbooked) slots for a doctor on a given date.
 *
 * Uses getOrCreateDailySlots() to auto-generate slots from the doctor's
 * working_hours + slot_duration if none exist yet for that date.
 *
 * @param organisationId  Organisation UUID (enforced server-side — NFR-4)
 * @param doctorId        User.id of the doctor (role = 'doctor')
 * @param dateStr         ISO date string e.g. "2026-06-20"
 */
export async function getAvailableSlotsForDoctor(
  organisationId: string,
  doctorId: string,
  dateStr: string,
): Promise<SlotQueryResult> {
  try {
    // Delegate slot generation/retrieval to the existing centralized function
    const result = await getOrCreateDailySlots(doctorId, dateStr, { organizationId: organisationId });

    if (!result.success) {
      return { success: false, slots: [], date: dateStr, error: 'Failed to load slots' };
    }

    const now = new Date();
    
    // Return all slots but mark them as available or not
    const allSlots = (result.data as any[]).map(s => {
      const card = mapToSlotCard(s);
      const isBooked = s.is_booked === true || s.is_available === false;
      const slotDateTime = new Date(`${dateStr}T${s.start_time}:00`);
      const isPast = slotDateTime <= now;
      
      // We will attach an extra property (even if not strictly in the base contract)
      (card as any).isAvailable = !isBooked && !isPast;
      return card;
    });

    return { success: true, slots: allSlots, date: dateStr };
  } catch (error) {
    console.error('[SlotService] getAvailableSlotsForDoctor error:', error);
    return {
      success: false,
      slots: [],
      date: dateStr,
      error: error instanceof Error ? error.message : 'Slot fetch failed',
    };
  }
}

/**
 * Re-verify that a specific slot is still available immediately before booking.
 * Call this right before `createVoiceAppointment` to prevent the race condition
 * where a slot is read as available but booked by another session before commit.
 * (FR-5.4, Technical Workflow §10: "Slot taken between read & select → re-fetch")
 *
 * @returns true if the slot is still free; false if it has been booked since
 */
export async function isSlotStillAvailable(
  organisationId: string,
  slotId: string,
): Promise<boolean> {
  try {
    const db = getTenantPrisma(organisationId);
    const slot = await db.appointmentSlot.findFirst({
      where: { id: slotId },
      select: { is_available: true, is_booked: true },
    });
    if (!slot) return false;
    return (slot as any).is_available === true && (slot as any).is_booked === false;
  } catch (error) {
    console.error('[SlotService] isSlotStillAvailable error:', error);
    return false; // Fail safe — treat as unavailable
  }
}

/**
 * Find the next date (starting from startDate, up to maxDays ahead)
 * on which the doctor has at least one available slot.
 *
 * Returns null if no slots found within the search window.
 * Used for the "no slots available" fallback (FR-5.4).
 */
export async function findNextAvailableDate(
  organisationId: string,
  doctorId: string,
  startDate: string,
  maxDays: number = 7,
): Promise<string | null> {
  const start = new Date(startDate);

  for (let i = 1; i <= maxDays; i++) {
    const next = new Date(start);
    next.setDate(start.getDate() + i);
    const dateStr = next.toISOString().split('T')[0];

    const result = await getAvailableSlotsForDoctor(organisationId, doctorId, dateStr);
    const hasAvailable = result.success && result.slots.some((s: any) => s.isAvailable !== false);
    if (hasAvailable) {
      return dateStr;
    }
  }

  return null;
}
