import { NextRequest, NextResponse } from 'next/server';
import { requireTenantContext } from '@/backend/tenant';
import { EDIT_CANCEL_ACTIONS, resolveAuditActionFilter, auditActorFromDetails } from '@/app/lib/audit-actions';
import { getDayRange, getOrgTimezone } from '@/app/lib/timezone';

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
    if (action) where.action = resolveAuditActionFilter(action);
    if (module) where.module = module;
    if (scope === 'edits' && !action) where.action = { in: [...EDIT_CANCEL_ACTIONS] };
    if (from || to) {
      // Both inputs are date-only. Resolve them against the ORG's timezone, not
      // the server's — `new Date('2026-08-31')` is UTC midnight, which on an IST
      // box silently dropped the first 5.5h of the range and the last 5.5h of
      // the day the user asked for.
      const tz = await getOrgTimezone();
      where.created_at = {};
      if (from) where.created_at.gte = getDayRange(from, tz).start;
      if (to) where.created_at.lte = getDayRange(to, tz).end;
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
        // Prefer what was stamped on the row, then the resolved user, then the
        // actor recorded inside `details` — most historical rows predate the
        // username/user_id columns and only carry the name in the JSON.
        user_display: l.username || u?.name || u?.username || auditActorFromDetails(l.details) || null,
        user_role: l.role || u?.role || null,
      };
    });

    return NextResponse.json({ ok: true, data, total });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
