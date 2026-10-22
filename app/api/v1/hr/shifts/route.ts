import { fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { createShiftPattern, getShiftPatterns } from '@/app/actions/hr-actions';

export const GET = mobileRoute(async () => fromAction(await getShiftPatterns()));

/** POST /api/v1/hr/shifts  { name, startTime, endTime } */
export const POST = mobileRoute(async (req) => fromAction(await createShiftPattern((await readJson(req)) as any), 201));
