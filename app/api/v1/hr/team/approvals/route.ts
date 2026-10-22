import { fromAction, mobileRoute } from '@/app/lib/mobile/api';
import { getMyTeamApprovals } from '@/app/actions/hr-self-service-actions';

/** GET /api/v1/hr/team/approvals — pending leave + regularizations from my direct reports. */
export const GET = mobileRoute(async () => fromAction(await getMyTeamApprovals()));
