import { fromAction, intParam, mobileRoute } from '@/app/lib/mobile/api';
import { deleteHoliday } from '@/app/actions/hr-actions';

export const DELETE = mobileRoute<{ id: string }>(async (_req, { params }) => fromAction(await deleteHoliday(intParam(params.id))));
