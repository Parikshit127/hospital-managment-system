/**
 * GET /api/doctors/[doctorId]/slots
 * =====================================================================
 * Track B — Step 5 API: Live available slots for a doctor on a given date
 *
 * Query params:
 *   date    (required) — ISO date string e.g. "2026-06-20"
 *   orgId   (required) — Organisation UUID (server-side validated, NFR-4)
 *
 * Security:
 * - orgId validated server-side; doctor must belong to that org
 * - Only returns is_available=true, is_booked=false slots
 * - Slots are auto-generated if none exist (via getOrCreateDailySlots)
 *
 * Double-booking note:
 * - Slots returned here are a snapshot. The actual booking endpoint
 *   re-verifies availability in a transaction before committing.
 * =====================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getTenantPrisma } from '@/backend/db';
import { getAvailableSlotsForDoctor, findNextAvailableDate } from '@/lib/booking/slot-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> },
) {
  try {
    const { doctorId } = await params;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const orgId = searchParams.get('orgId');

    // ── 400: Missing required params ─────────────────────────────────────────
    if (!doctorId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'doctorId is required' },
        { status: 400 },
      );
    }
    if (!orgId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'orgId query parameter is required' },
        { status: 400 },
      );
    }
    if (!date?.trim()) {
      return NextResponse.json(
        { success: false, error: 'date query parameter is required (ISO format: YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    // ── Validate date format ──────────────────────────────────────────────────
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { success: false, error: 'date must be a valid ISO date string (e.g. 2026-06-20)' },
        { status: 400 },
      );
    }

    // ── Validate org exists (NFR-4) ───────────────────────────────────────────
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, is_active: true },
    });
    if (!org || !org.is_active) {
      return NextResponse.json(
        { success: false, error: 'Organisation not found or inactive' },
        { status: 404 },
      );
    }

    // ── Validate doctor belongs to this org ───────────────────────────────────
    const db = getTenantPrisma(orgId);
    const doctor = await db.user.findFirst({
      where: { id: doctorId, role: 'doctor', is_active: true },
      select: { id: true, name: true, specialty: true, working_hours: true, working_days: true },
    });
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found in this organisation' },
        { status: 404 },
      );
    }

    // ── Fetch slots via service layer ─────────────────────────────────────────
    const result = await getAvailableSlotsForDoctor(orgId, doctorId, date);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? 'Failed to fetch slots' },
        { status: 500 },
      );
    }

    // ── If no slots for this date, find the next available date ──────────────
    // The UI will offer this to the patient (FR-5.4 — never offer a fake slot)
    let nextAvailableDate: string | null = null;
    if (result.slots.length === 0) {
      nextAvailableDate = await findNextAvailableDate(orgId, doctorId, date, 7);
    }

    return NextResponse.json({
      success: true,
      slots: result.slots,
      date: result.date,
      doctor: {
        id: (doctor as any).id,
        name: (doctor as any).name,
        specialty: (doctor as any).specialty,
        workingHours: (doctor as any).working_hours,
        workingDays: (doctor as any).working_days,
      },
      // Populated when 0 slots exist — UI asks patient if they'd like this date instead
      nextAvailableDate,
    });
  } catch (error: any) {
    console.error('[GET /api/doctors/[doctorId]/slots]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
