import { NextRequest, NextResponse } from 'next/server';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { getTemplate, getTemplateHeaders } from '@/app/lib/import/templates';
import { generateTemplateFile } from '@/app/lib/import/parser';
import type { ImportType } from '@/app/types/import';

const VALID_TYPES = new Set(['patients', 'staff', 'invoices', 'lab_results', 'pharmacy', 'appointments']);

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ type: string }> },
) {
    const auth = await resolveRouteAuth({ allowedStaffRoles: ['admin'] });
    if (!auth.ok) return auth.response;

    const { type } = await params;
    if (!VALID_TYPES.has(type)) {
        return NextResponse.json({ success: false, error: 'Invalid import type' }, { status: 400 });
    }

    const importType = type as ImportType;
    const template = getTemplate(importType);
    const headers = getTemplateHeaders(importType);

    // Generate sample row from template column examples
    const sampleRow: Record<string, string> = {};
    for (const col of template.columns) {
        sampleRow[col.name] = col.example || '';
    }

    const format = (req.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx') as 'csv' | 'xlsx';
    const buffer = generateTemplateFile(headers, [sampleRow], format);

    const contentType = format === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const ext = format === 'csv' ? 'csv' : 'xlsx';

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${template.name.replace(/\s+/g, '_')}_Template.${ext}"`,
        },
    });
}
