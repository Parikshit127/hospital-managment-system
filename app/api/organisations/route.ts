// app/api/organisations/route.ts — [A] Organisations list API
// Returns the same data as /api/public/organizations but at the path
// specified in the voice flow spec. Thin wrapper for consistency.

import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

export async function GET() {
  try {
    const orgs = await prisma.organization.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        logo_url: true,
        hospital_type: true,
        specialties: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ orgs });
  } catch (error) {
    console.error('[Voice] Orgs fetch error:', error);
    return NextResponse.json({ orgs: [] });
  }
}
