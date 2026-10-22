import { fromAction, intParam, mobileRoute } from '@/app/lib/mobile/api';
import { removeShiftAssignment } from '@/app/actions/hr-actions';

export const DELETE = mobileRoute<{ id: string }>(async (_req, { params }) => fromAction(await removeShiftAssignment(intParam(params.id))));
