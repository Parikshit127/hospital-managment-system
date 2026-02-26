import { prisma } from '@/backend/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const slug = request.nextUrl.searchParams.get('slug');

    if (!slug) {
        return NextResponse.json({ success: false, error: 'Missing slug' }, { status: 400 });
    }

    try {
        const org = await prisma.organization.findUnique({
            where: { slug },
            select: { id: true, name: true, is_active: true },
        });

        if (!org || !org.is_active) {
            return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: { id: org.id, name: org.name },
        });
    } catch (error) {
        console.error('Org lookup error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
