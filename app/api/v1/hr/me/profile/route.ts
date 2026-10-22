import { fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { getMyProfile, updateMyProfile } from '@/app/actions/hr-self-service-actions';

export const GET = mobileRoute(async () => fromAction(await getMyProfile()));

/** PATCH /api/v1/hr/me/profile — self-editable fields only (see updateMyProfile). */
export const PATCH = mobileRoute(async (req) => fromAction(await updateMyProfile(await readJson(req))));
