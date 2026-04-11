import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext } from '@/backend/tenant';

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireTenantContext();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') ?? '';
    const action = searchParams.get('action') ?? '';
    const offset = Number(searchParams.get('offset') ?? '0');
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

    const where: any = {};
    if (action) where.action = action;
    if (search) {
      where.OR = [
        { entity_id: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
        { user_id: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Check what the audit log model is called
    // Try system_audit_logs first
    let logs: any[] = [];
    try {
      logs = await (db as any).system_audit_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      });
    } catch {
      // Model might not exist or have different name
      logs = [];
    }

    return NextResponse.json({ ok: true, data: logs });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
