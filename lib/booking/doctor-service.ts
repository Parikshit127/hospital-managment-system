/**
 * lib/booking/doctor-service.ts
 * =====================================================================
 * Track B — Step 4 service: Live doctor query
 *
 * Rules enforced here:
 * - All queries are scoped to organisationId via getTenantPrisma (NFR-4)
 * - Specialty matching is case-insensitive; no hardcoded doctor list (FR-4.1)
 * - If specialty yields 0 results, we do NOT auto-fall back to General Medicine;
 *   instead we return empty so the caller can ask the patient to clarify (per user decision)
 * - We never fabricate a doctor (FR-4.4)
 * =====================================================================
 */

import { getTenantPrisma } from '@/backend/db';
import type { DoctorCard } from '@/lib/contracts/voice';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DoctorQueryOptions {
  /** Filter by specialty (case-insensitive contains match) */
  specialty?: string;
  /** If true, only return doctors who are active and accepting appointments */
  available?: boolean;
}

export interface DoctorQueryResult {
  success: boolean;
  doctors: DoctorCard[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildWhere(options: DoctorQueryOptions): Record<string, unknown> {
  const where: Record<string, unknown> = { role: 'doctor' };

  if (options.available !== false) {
    where.is_active = true;
  }

  if (options.specialty && options.specialty.trim()) {
    where.specialty = {
      contains: options.specialty.trim(),
      mode: 'insensitive',
    };
  }

  return where;
}

function mapToDoctorCard(user: {
  id: string;
  name: string | null;
  specialty: string | null;
  consultation_fee?: number | null;
  working_hours?: string | null;
  working_days?: string | null;
}): DoctorCard {
  return {
    id: user.id,
    name: user.name ?? 'Unknown Doctor',
    specialty: user.specialty ?? 'General Medicine',
    consultationFee: typeof user.consultation_fee === 'number' ? user.consultation_fee : 0,
    workingHours: user.working_hours ?? '09:00-17:00',
    workingDays: user.working_days ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch doctors from the live database, scoped to the given organisation.
 *
 * Returns an empty array (not an error) when no doctors match the specialty —
 * callers should handle this by asking the patient to clarify their symptoms
 * or to pick a department from a list.
 *
 * NEVER returns fabricated doctors (FR-4.4).
 *
 * @param organisationId  Organisation UUID — enforced server-side (NFR-4)
 * @param options         Specialty filter + availability filter
 */
export async function getDoctorsBySpecialty(
  organisationId: string,
  options: DoctorQueryOptions = {},
): Promise<DoctorQueryResult> {
  try {
    const db = getTenantPrisma(organisationId);

    const users = await db.user.findMany({
      where: buildWhere(options),
      select: {
        id: true,
        name: true,
        specialty: true,
        consultation_fee: true,
        working_hours: true,
        working_days: true,
      },
      orderBy: [
        { name: 'asc' },
      ],
    });

    const doctors: DoctorCard[] = (users as any[]).map(mapToDoctorCard);

    return { success: true, doctors };
  } catch (error) {
    console.error('[DoctorService] getDoctorsBySpecialty error:', error);
    return {
      success: false,
      doctors: [],
      error: error instanceof Error ? error.message : 'Failed to fetch doctors',
    };
  }
}

/**
 * Fetch a single doctor by their user ID, scoped to the given organisation.
 * Returns null if not found or not in this organisation.
 */
export async function getDoctorById(
  organisationId: string,
  doctorId: string,
): Promise<DoctorCard | null> {
  try {
    const db = getTenantPrisma(organisationId);

    const user = await db.user.findFirst({
      where: { id: doctorId, role: 'doctor', is_active: true },
      select: {
        id: true,
        name: true,
        specialty: true,
        consultation_fee: true,
        working_hours: true,
        working_days: true,
      },
    });

    if (!user) return null;
    return mapToDoctorCard(user as any);
  } catch (error) {
    console.error('[DoctorService] getDoctorById error:', error);
    return null;
  }
}

/**
 * Return all unique specialties available within the given organisation.
 * Used as a fallback list when the patient wants to manually pick a department.
 */
export async function getAvailableSpecialties(
  organisationId: string,
): Promise<string[]> {
  try {
    const db = getTenantPrisma(organisationId);

    const users = await db.user.findMany({
      where: { role: 'doctor', is_active: true },
      select: { specialty: true },
    });

    const specialties = (users as any[])
      .map((u: any) => u.specialty as string | null)
      .filter((s): s is string => Boolean(s && s.trim()))
      .map(s => s.trim());

    // Deduplicate and sort
    return [...new Set(specialties)].sort();
  } catch (error) {
    console.error('[DoctorService] getAvailableSpecialties error:', error);
    return [];
  }
}
