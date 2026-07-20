'use server';

/**
 * app/actions/call-center-actions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-side server actions for the Call Center module (dashboard, logs, detail).
 *
 * These are the FIRST real readers of the `CallLog` model, which until now was
 * unused scaffolding. Rows are written by the AI voice assistant (Phase 2+) and
 * by the manual call-center booking flow. Everything is org-scoped via
 * requireTenantContext() (the tenant Prisma client auto-injects organizationId).
 */

import { requireTenantContext } from '@/backend/tenant';

export interface CallLogFilters {
  callType?: string; // Inbound | Outbound | Follow-up | All
  outcome?: string; // Booked | Cancelled | Rescheduled | Enquiry | Registered | Callback | Transferred | NoAnswer | Busy | All
  channel?: string; // manual | voice_ai | All
  dateFrom?: string; // ISO date (yyyy-mm-dd)
  dateTo?: string; // ISO date (yyyy-mm-dd)
  search?: string; // phone or patient name contains
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Dashboard stat tiles: today's calls, appointments booked today, pending
 * callbacks, and average call duration (today).
 */
export async function getCallCenterStats() {
  try {
    const { db, organizationId } = await requireTenantContext();
    const todayStart = startOfToday();

    const [todayCalls, booked, pendingCallbacks, durationAgg] = await Promise.all([
      db.callLog.count({
        where: { organizationId, created_at: { gte: todayStart } },
      }),
      db.callLog.count({
        where: { organizationId, created_at: { gte: todayStart }, outcome: 'Booked' },
      }),
      db.callLog.count({
        where: { organizationId, handoff_status: 'callback_created' },
      }),
      db.callLog.aggregate({
        where: {
          organizationId,
          created_at: { gte: todayStart },
          duration_seconds: { not: null },
        },
        _avg: { duration_seconds: true },
      }),
    ]);

    const avgDuration = Math.round(durationAgg?._avg?.duration_seconds ?? 0);

    return { success: true, data: { todayCalls, booked, pendingCallbacks, avgDuration } };
  } catch {
    return { success: false, data: { todayCalls: 0, booked: 0, pendingCallbacks: 0, avgDuration: 0 } };
  }
}

/**
 * Filterable call-log list for the dashboard "recent calls" table and the
 * dedicated Logs page.
 */
export async function getCallLogs(filters?: CallLogFilters, limit = 200) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const where: any = { organizationId };

    if (filters?.callType && filters.callType !== 'All') where.call_type = filters.callType;
    if (filters?.outcome && filters.outcome !== 'All') where.outcome = filters.outcome;
    if (filters?.channel && filters.channel !== 'All') where.channel = filters.channel;

    if (filters?.dateFrom || filters?.dateTo) {
      where.created_at = {};
      if (filters.dateFrom) where.created_at.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.created_at.lte = new Date(`${filters.dateTo}T23:59:59.999`);
    }

    if (filters?.search) {
      const term = filters.search.trim();
      where.OR = [
        { patient_phone: { contains: term } },
        { patient_name: { contains: term, mode: 'insensitive' } },
      ];
    }

    const logs = await db.callLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    return { success: true, data: logs };
  } catch {
    return { success: false, data: [] };
  }
}

/**
 * Full detail for a single call — includes the transcript (transcript-only PHI
 * store), the linked patient, and the linked appointment when present.
 */
export async function getCallLogDetail(id: string) {
  try {
    const { db } = await requireTenantContext();
    const log = await db.callLog.findUnique({
      where: { id },
      include: {
        transcript: true,
        patient: {
          select: { patient_id: true, full_name: true, phone: true, age: true, gender: true },
        },
        appointment: {
          select: {
            appointment_id: true,
            doctor_name: true,
            department: true,
            appointment_date: true,
            status: true,
          },
        },
      },
    });

    if (!log) return { success: false, data: null };
    return { success: true, data: log };
  } catch {
    return { success: false, data: null };
  }
}
