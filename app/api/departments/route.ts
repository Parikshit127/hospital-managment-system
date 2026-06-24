import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

export async function GET() {
    try {
        const departments = await prisma.department.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
            select: { id: true, name: true }
        });
        return NextResponse.json(departments);
    } catch (error) {
        console.error('[API] Failed to fetch departments:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
