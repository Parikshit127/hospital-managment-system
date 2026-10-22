import { fromAction, mobileRoute } from '@/app/lib/mobile/api';
import { getMyAttendance } from '@/app/actions/hr-self-service-actions';

/** GET /api/v1/hr/me/attendance?month=YYYY-MM */
export const GET = mobileRoute(async (_req, { url }) => fromAction(await getMyAttendance(url.searchParams.get('month') ?? undefined)));
