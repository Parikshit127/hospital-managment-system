import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const report_id = searchParams.get('report_id');

        const whereClause: any = {
            organizationId: session.organization_id,
            OR: [
                { user_id: session.id },
                { is_shared: true }
            ]
        };

        if (report_id) {
            whereClause.report_id = report_id;
        }

        const presets = await prisma.report_presets.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ data: presets });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
        }

        const body = await req.json();
        const { report_id, name, filters_json, is_shared } = body;

        if (!report_id || !name || !filters_json) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const preset = await prisma.report_presets.create({
            data: {
                id: randomUUID(),
                report_id,
                name,
                filters_json,
                is_shared: Boolean(is_shared),
                user_id: session.id,
                organizationId: session.organization_id
            }
        });

        return NextResponse.json({ data: preset });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
