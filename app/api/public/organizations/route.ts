import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

// Public endpoint — returns list of active organizations for patient self-registration
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
                branding: { select: { primary_color: true, portal_title: true } },
            },
            orderBy: { name: 'asc' },
        });
        return NextResponse.json({ orgs });
    } catch (error) {
        console.error('Public orgs error:', error);
        return NextResponse.json({ orgs: [] });
    }
}
