import { fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { requestRegularization } from '@/app/actions/hr-self-service-actions';

/** POST /api/v1/hr/me/regularizations  { date, inTime?, outTime?, status?, reason } */
export const POST = mobileRoute(async (req) => {
    const b = await readJson(req);
    return fromAction(await requestRegularization({
        date: String(b.date ?? ''), inTime: b.inTime || undefined, outTime: b.outTime || undefined,
        status: b.status || undefined, reason: String(b.reason ?? ''),
    }), 201);
});
