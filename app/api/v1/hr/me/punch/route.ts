import { ApiError, fromAction, mobileRoute, ok, readJson } from '@/app/lib/mobile/api';
import { HrError, getMyEmployee, hrFail, recordPunch, requireStaff } from '@/app/lib/hr/hr-core';

/**
 * POST /api/v1/hr/me/punch  { type:'IN'|'OUT', lat, lng, accuracy?, mocked?, note? }
 * Location is mandatory from the app. The geofence itself is enforced by recordPunch (policy.requireGeo).
 */
export const POST = mobileRoute(async (req) => {
    const b = await readJson(req);
    if (b.type !== 'IN' && b.type !== 'OUT') throw new ApiError('type must be IN or OUT');
    if (typeof b.lat !== 'number' || typeof b.lng !== 'number') throw new ApiError('Location is required to punch.');
    if (b.mocked === true) throw new ApiError('Mock/fake location detected. Turn it off and try again.', 403);
    try {
        const ctx = await requireStaff();
        const employee = await getMyEmployee(ctx);
        const { event, attendance } = await recordPunch(ctx, employee, {
            type: b.type, lat: b.lat, lng: b.lng,
            accuracy: typeof b.accuracy === 'number' ? b.accuracy : undefined,
            note: typeof b.note === 'string' ? b.note.trim().slice(0, 200) || undefined : undefined,
            source: 'MOBILE',
        });
        return ok({
            type: event.type as 'IN' | 'OUT', at: event.occurred_at.toISOString(),
            status: attendance?.status ?? null, lateMinutes: attendance?.late_minutes ?? 0,
        });
    } catch (e) {
        if (e instanceof HrError || (e as any)?.name === 'ForbiddenError' || (e as any)?.name === 'AuthError') return fromAction(hrFail(e, 'Could not record your punch'));
        throw e;
    }
});
