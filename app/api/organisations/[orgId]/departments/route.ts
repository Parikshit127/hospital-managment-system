// app/api/organisations/[orgId]/departments/route.ts — [A] Departments by org API
// Returns departments scoped to a specific organisation for the voice flow.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;

    if (!orgId) {
      return NextResponse.json(
        { error: 'Organisation ID is required' },
        { status: 400 },
      );
    }

    // Verify the org exists and is active
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, is_active: true },
    });

    if (!org || !org.is_active) {
      return NextResponse.json(
        { error: 'Organisation not found' },
        { status: 404 },
      );
    }

    // Fetch departments scoped to this organisation
    const departments = await prisma.department.findMany({
      where: {
        organizationId: orgId,
        is_active: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      departments: departments.map(d => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
      })),
    });
  } catch (error) {
    console.error('[Voice] Departments fetch error:', error);
    return NextResponse.json({ departments: [] });
  }
}
