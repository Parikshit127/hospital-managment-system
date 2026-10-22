import { fromAction, intParam, mobileRoute } from '@/app/lib/mobile/api';
import { cancelLeaveByHr } from '@/app/actions/hr-actions';

/** POST /api/v1/hr/leave/:id/cancel — HR cancels any pending/approved leave. */
export const POST = mobileRoute<{ id: string }>(async (_req, { params }) => fromAction(await cancelLeaveByHr(intParam(params.id))));
