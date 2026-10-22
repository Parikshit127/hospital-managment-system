import { fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { applyMyLeave, getMyLeave } from '@/app/actions/hr-self-service-actions';

/** GET /api/v1/hr/me/leave?year=YYYY — balances, leave types, my requests. */
export const GET = mobileRoute(async (_req, { url }) => {
    const y = Number(url.searchParams.get('year'));
    return fromAction(await getMyLeave(Number.isInteger(y) && y > 0 ? y : undefined));
});

/** POST /api/v1/hr/me/leave  { leaveTypeId, fromDate, toDate, reason?, isHalfDay? } */
export const POST = mobileRoute(async (req) => {
    const b = await readJson(req);
    return fromAction(await applyMyLeave({
        leaveTypeId: Number(b.leaveTypeId), fromDate: String(b.fromDate ?? ''), toDate: String(b.toDate ?? ''),
        reason: typeof b.reason === 'string' ? b.reason : undefined, isHalfDay: b.isHalfDay === true,
    }), 201);
});
