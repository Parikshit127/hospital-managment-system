import { NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { getSession } from '@/app/lib/session';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
        }

        const { id: presetId } = await params;
        const preset = await prisma.report_presets.findUnique({ where: { id: presetId } });

        if (!preset) {
            return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
        }

        // Only the owner can modify the preset
        if (preset.user_id !== session.id || preset.organizationId !== session.organization_id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const updated = await prisma.report_presets.update({
            where: { id: presetId },
            data: {
                name: body.name !== undefined ? body.name : preset.name,
                is_shared: body.is_shared !== undefined ? Boolean(body.is_shared) : preset.is_shared,
            }
        });

        return NextResponse.json({ data: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
        }

        const { id: presetId } = await params;
        const preset = await prisma.report_presets.findUnique({ where: { id: presetId } });

        if (!preset) {
            return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
        }

        // Only the owner can delete the preset
        if (preset.user_id !== session.id || preset.organizationId !== session.organization_id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.report_presets.delete({ where: { id: presetId } });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
