/**
 * POST /api/lab/analyzer/result — inbound lab-analyzer results (HL7 v2 ORU).
 *
 * Accepts a raw HL7 ORU^R01 message (text/plain) or JSON { message }, maps it to
 * a lab order by barcode (OBR-2/OBR-3), and completes the order through the normal
 * pipeline (auto-flag critical, notify patient, alert doctor on critical, post IPD
 * charge, stamp completion time). This is the software side of analyzer interfacing;
 * a production on-prem bridge would read the physical analyzer and POST here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/db';
import { resolveRouteAuth } from '@/app/lib/route-auth';
import { parseOru } from '@/app/lib/lab/hl7';
import { uploadResult } from '@/app/actions/lab-actions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
        // Auth: staff session (lab tech / admin). A production bridge would instead
        // present a shared key header (X-Analyzer-Key) — add when hardware is wired;
        // the parsing/mapping below is identical.
        const auth = await resolveRouteAuth({ allowedStaffRoles: ['admin', 'lab_technician'] });
        if (!auth.ok) return auth.response;
        const orgId = auth.context.organizationId;

        const contentType = req.headers.get('content-type') || '';
        let message = '';
        if (contentType.includes('application/json')) {
            const body = await req.json().catch(() => ({}));
            message = body?.message || '';
        } else {
            message = await req.text();
        }
        if (!message.trim()) return NextResponse.json({ error: 'Empty HL7 message' }, { status: 400 });

        const parsed = parseOru(message);
        if (!parsed.barcode) return NextResponse.json({ error: 'No order barcode found (expected in OBR-2/OBR-3)' }, { status: 400 });
        if (parsed.results.length === 0) return NextResponse.json({ error: 'No OBX result segments found' }, { status: 400 });

        const order = await prisma.lab_orders.findFirst({
            where: { barcode: parsed.barcode, organizationId: orgId },
            select: { id: true },
        });
        if (!order) return NextResponse.json({ error: `No lab order for barcode ${parsed.barcode}` }, { status: 404 });

        const resultText = parsed.results
            .map((r) => `${r.testId ? r.testId + ': ' : ''}${r.value}${r.units ? ' ' + r.units : ''}${r.flag ? ' [' + r.flag + ']' : ''}`)
            .join('\n');

        // Reuse the standard completion pipeline (auto-critical, patient notify,
        // doctor alert, IPD charge, TAT completion timestamp).
        const res = await uploadResult(parsed.barcode, resultText, 'Auto-imported from analyzer (HL7 ORU)');
        if (!res.success) return NextResponse.json({ error: res.error || 'Failed to save result' }, { status: 500 });

        return NextResponse.json({ success: true, barcode: parsed.barcode, testsImported: parsed.results.length, resultText });
    } catch (error) {
        console.error('[Analyzer] result import error:', error);
        return NextResponse.json({ error: 'Failed to import analyzer result' }, { status: 500 });
    }
}
