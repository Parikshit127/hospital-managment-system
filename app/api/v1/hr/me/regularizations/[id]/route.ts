import { fromAction, intParam, mobileRoute } from '@/app/lib/mobile/api';
import { cancelMyRegularization } from '@/app/actions/hr-self-service-actions';

/** DELETE /api/v1/hr/me/regularizations/:id — withdraw a pending request. */
export const DELETE = mobileRoute<{ id: string }>(async (_req, { params }) => fromAction(await cancelMyRegularization(intParam(params.id))));
