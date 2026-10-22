import { fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { addHoliday, getHolidays } from '@/app/actions/hr-actions';

/** GET /api/v1/hr/holidays?year=YYYY */
export const GET = mobileRoute(async (_req, { url }) => {
    const y = Number(url.searchParams.get('year')) || new Date().getFullYear();
    return fromAction(await getHolidays(y));
});

/** POST /api/v1/hr/holidays  { date, name, type?: 'PUBLIC'|'OPTIONAL' } */
export const POST = mobileRoute(async (req) => fromAction(await addHoliday((await readJson(req)) as any), 201));
