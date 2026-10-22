import { fromAction, mobileRoute } from '@/app/lib/mobile/api';
import { getMyRoster } from '@/app/actions/hr-self-service-actions';

/** GET /api/v1/hr/me/roster?from=YYYY-MM-DD&days=14 */
export const GET = mobileRoute(async (_req, { url }) => {
    const days = Number(url.searchParams.get('days'));
    return fromAction(await getMyRoster(url.searchParams.get('from') ?? undefined, Number.isFinite(days) && days > 0 ? days : 14));
});
