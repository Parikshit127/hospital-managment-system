import { fromAction, intParam, mobileRoute } from '@/app/lib/mobile/api';
import { cancelMyLeave } from '@/app/actions/hr-self-service-actions';

/** DELETE /api/v1/hr/me/leave/:id — cancel my pending/upcoming leave. */
export const DELETE = mobileRoute<{ id: string }>(async (_req, { params }) => fromAction(await cancelMyLeave(intParam(params.id))));
