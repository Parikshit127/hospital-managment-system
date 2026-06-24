import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';

export async function GET() {
    try {
        const stores = await prisma.stores.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
            select: { id: true, name: true }
        });
        
        // Convert IDs to strings because MISFilterEngine dropdown uses string values natively
        const mappedStores = stores.map(store => ({
            id: String(store.id),
            name: store.name
        }));
        
        return NextResponse.json(mappedStores);
    } catch (error) {
        console.error('[API] Failed to fetch stores:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
