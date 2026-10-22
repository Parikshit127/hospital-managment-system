import { fromAction, mobileRoute } from '@/app/lib/mobile/api';
import { getHRDashboard } from '@/app/actions/hr-actions';

export const GET = mobileRoute(async () => fromAction(await getHRDashboard()));
