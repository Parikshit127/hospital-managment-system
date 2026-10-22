import { fromAction, mobileRoute } from '@/app/lib/mobile/api';
import { getRegularizations } from '@/app/actions/hr-actions';

/** GET /api/v1/hr/regularizations?filter=pending|approved|rejected|all (HR) */
export const GET = mobileRoute(async (_req, { url }) => {
    const f = url.searchParams.get('filter');
    return fromAction(await getRegularizations(f === 'approved' || f === 'rejected' || f === 'all' ? f : 'pending'));
});
