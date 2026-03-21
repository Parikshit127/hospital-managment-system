import { NextRequest, NextResponse } from 'next/server';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { parseFile } from '@/app/lib/import/parser';

export async function POST(req: NextRequest) {
    const auth = await resolveRouteAuth({ allowedStaffRoles: ['admin'] });
    if (!auth.ok) return auth.response;

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const importType = formData.get('importType') as string | null;

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
        }
        if (!importType) {
            return NextResponse.json({ success: false, error: 'Import type is required' }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const parsed = parseFile(buffer, file.name);

        return NextResponse.json({
            success: true,
            headers: parsed.headers,
            previewRows: parsed.previewRows,
            totalRows: parsed.totalRows,
            fileName: file.name,
            fileSize: file.size,
            data: parsed.data,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse file';
        return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
}
