import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext } from '@/backend/tenant';
import { EDIT_CANCEL_ACTIONS } from '@/app/lib/audit-actions';

export async function GET(req: NextRequest) {
  try {
    const { db, organizationId } = await requireTenantContext();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') ?? '';
    const action = searchParams.get('action') ?? '';
    const module = searchParams.get('module') ?? '';
    const from = searchParams.get('from') ?? '';
    const to = searchParams.get('to') ?? '';
    // ?scope=edits restricts to the edit/cancel action set above.
    const scope = searchParams.get('scope') ?? '';
    const offset = Number(searchParams.get('offset') ?? '0');
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

    // Audit rows are tenant data — without this filter one org could read
    // another org's activity log.
    const where: any = { organizationId };
    if (action) where.action = action;
    if (module) where.module = module;
    if (scope === 'edits' && !action) where.action = { in: [...EDIT_CANCEL_ACTIONS] };
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = new Date(from);
      // `to` is a date-only input; include the whole of that day.
      if (to) where.created_at.lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    if (search) {
      where.OR = [
        { entity_id: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { details: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      (db as any).system_audit_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      (db as any).system_audit_logs.count({ where }),
    ]);

    // Most audit writes store only user_id (a UUID), which is unreadable in the
    // UI — resolve them to real names in one query rather than per row.
    const userIds = Array.from(new Set(logs.map((l: any) => l.user_id).filter(Boolean)));
    const users = userIds.length
      ? await (db as any).user.findMany({
          where: { id: { in: userIds as string[] } },
          select: { id: true, username: true, name: true, role: true },
        })
      : [];
    const userMap = new Map<string, any>(users.map((u: any) => [u.id, u]));

    const data = logs.map((l: any) => {
      const u = l.user_id ? userMap.get(l.user_id) : null;
      return {
        ...l,
        // Prefer what was stamped on the row; fall back to the resolved user.
        user_display: l.username || u?.name || u?.username || null,
        user_role: l.role || u?.role || null,
      };
    });

    return NextResponse.json({ ok: true, data, total });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
