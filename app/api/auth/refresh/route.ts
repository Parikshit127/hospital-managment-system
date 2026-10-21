import { NextResponse } from 'next/server';
import { refreshAccessClaims } from '@/app/lib/access/session-refresh';

/**
 * POST /api/auth/refresh — re-mint the caller's access claims (Company-OS Phase 3).
 * A no-op (`unchanged`) for every unit that is not in `enforce` mode. Cookie-authenticated; takes no input.
 */
export async function POST() {
    const result = await refreshAccessClaims();
    if (result.status === 'no-session') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(result);
}
