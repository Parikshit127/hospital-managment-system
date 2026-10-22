import { fromAction, mobileRoute } from '@/app/lib/mobile/api';
import { getMyWorkspace } from '@/app/actions/hr-self-service-actions';

/** GET /api/v1/hr/me/workspace — everything the Home tab needs in one call. */
export const GET = mobileRoute(async () => fromAction(await getMyWorkspace()));
