/**
 * GET /api/organisations/[orgId]/doctors
 * =====================================================================
 * Track B — Step 4 API: Live doctor query scoped to an organisation
 *
 * Query params:
 *   specialty  (optional) — filter by specialty (case-insensitive contains)
 *   available  (optional) — "true" (default) to only return active doctors
 *
 * Security:
 * - orgId is validated against DB before any user data is returned (NFR-4)
 * - getTenantPrisma enforces org boundary at query level
 * - No patient data is exposed — doctors only
 *
 * Track A note: this file lives in organisations/[orgId]/ which is the same
 * parent folder as Track A's departments route. That is intentional and
 * conflict-free — git diffs are per-file, not per-folder.
 * =====================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import {
  getDoctorsBySpecialty,
  getAvailableSpecialties,
} from '@/lib/booking/doctor-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;

    // ── 400: Missing orgId param ─────────────────────────────────────────────
    if (!orgId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'orgId is required' },
        { status: 400 },
      );
    }

    // ── Validate org exists server-side (NFR-4 — never trust client org IDs) ─
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

    // ── Parse query params ────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const specialty = searchParams.get('specialty') ?? undefined;
    const availableParam = searchParams.get('available');
    // Default available=true unless explicitly set to "false"
    const available = availableParam !== 'false';

    // ── Fetch doctors via service layer ───────────────────────────────────────
    const result = await getDoctorsBySpecialty(orgId, { specialty, available });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? 'Failed to fetch doctors' },
        { status: 500 },
      );
    }

    // ── 404: No doctors found for this specialty ───────────────────────────────
    // We return 200 with empty array + availableSpecialties list so the voice
    // UI can ask the patient to choose a different department (FR-4.4).
    // We never return a fabricated doctor.
    let availableSpecialties: string[] = [];
    if (result.doctors.length === 0 && specialty) {
      // Fetch all specialties in this org to show patient what's available
      availableSpecialties = await getAvailableSpecialties(orgId);
    }

    return NextResponse.json({
      success: true,
      doctors: result.doctors,
      // Provided when specialty filter returned 0 results — UI uses this
      // to ask the patient to pick from a real list of departments
      availableSpecialties,
      totalCount: result.doctors.length,
    });
  } catch (error: any) {
    console.error('[GET /api/organisations/[orgId]/doctors]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
