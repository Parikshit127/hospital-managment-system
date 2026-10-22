import { ApiError, fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { createShiftRoster, getShiftAssignments } from '@/app/actions/hr-actions';

/** GET /api/v1/hr/roster?date=YYYY-MM-DD */
export const GET = mobileRoute(async (_req, { url }) => {
    const date = url.searchParams.get('date');
    if (!date) throw new ApiError('date is required');
    return fromAction(await getShiftAssignments(date));
});

/** POST /api/v1/hr/roster  { employeeId, shiftPatternId, startDate, endDate } (max 62 days) */
export const POST = mobileRoute(async (req) => {
    const b = await readJson(req);
    return fromAction(await createShiftRoster({
        employeeId: Number(b.employeeId), shiftPatternId: Number(b.shiftPatternId),
        startDate: String(b.startDate ?? ''), endDate: String(b.endDate ?? ''),
    }), 201);
});
