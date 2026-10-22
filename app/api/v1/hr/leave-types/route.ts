import { fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { getLeaveTypes, saveLeaveType } from '@/app/actions/hr-actions';

export const GET = mobileRoute(async () => fromAction(await getLeaveTypes()));

/** POST /api/v1/hr/leave-types  { id?, name, daysPerYear, isPaid?, carryForward?, isActive? } */
export const POST = mobileRoute(async (req) => fromAction(await saveLeaveType((await readJson(req)) as any)));
