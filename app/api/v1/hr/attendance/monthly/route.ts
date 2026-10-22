import { ApiError, fromAction, mobileRoute } from '@/app/lib/mobile/api';
import { getMonthlyAttendance } from '@/app/actions/hr-actions';

/** GET /api/v1/hr/attendance/monthly?month=YYYY-MM&search=&designation= */
export const GET = mobileRoute(async (_req, { url }) => {
    const month = url.searchParams.get('month');
    if (!month) throw new ApiError('month is required');
    return fromAction(await getMonthlyAttendance(month, {
        search: url.searchParams.get('search') ?? undefined, designation: url.searchParams.get('designation') ?? undefined,
    }));
});
