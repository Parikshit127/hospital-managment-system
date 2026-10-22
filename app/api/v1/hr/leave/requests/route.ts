import { fromAction, mobileRoute } from '@/app/lib/mobile/api';
import { getLeaveRequests } from '@/app/actions/hr-actions';

/** GET /api/v1/hr/leave/requests?filter=pending|approved|rejected|cancelled|all — HR sees all, managers their team. */
export const GET = mobileRoute(async (_req, { url }) => {
    const f = url.searchParams.get('filter');
    const ok = f === 'pending' || f === 'approved' || f === 'rejected' || f === 'cancelled' || f === 'all';
    return fromAction(await getLeaveRequests(ok ? f : 'pending'));
});
