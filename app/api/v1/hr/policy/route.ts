import { fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { getHrPolicySettings, updateHrPolicy } from '@/app/actions/hr-actions';

export const GET = mobileRoute(async () => fromAction(await getHrPolicySettings()));

/** PATCH /api/v1/hr/policy — partial attendance/leave policy (work hours, grace, geofence, ...). */
export const PATCH = mobileRoute(async (req) => fromAction(await updateHrPolicy(await readJson(req))));
