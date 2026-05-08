import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/app/lib/session';
import { prisma } from '@/backend/db';

export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session?.organization_id || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = request.nextUrl.searchParams.get('role');
    if (!role) {
        return NextResponse.json({ error: 'role param required' }, { status: 400 });
    }

    const users = await (prisma.user.findMany as any)({
        where: {
            organizationId: session.organization_id,
            role,
        },
        select: {
            id: true,
            name: true,
            username: true,
            role: true,
            is_active: true,
        },
        orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json({ users });
}
