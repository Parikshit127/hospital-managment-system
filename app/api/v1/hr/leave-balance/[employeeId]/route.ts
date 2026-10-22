import { fromAction, intParam, mobileRoute } from '@/app/lib/mobile/api';
import { getLeaveBalance } from '@/app/actions/hr-actions';

export const GET = mobileRoute<{ employeeId: string }>(async (_req, { params }) => fromAction(await getLeaveBalance(intParam(params.employeeId, 'employeeId'))));
