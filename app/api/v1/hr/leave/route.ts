import { fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { applyLeave } from '@/app/actions/hr-actions';

/** POST /api/v1/hr/leave  { employeeId, leaveTypeId, fromDate, toDate, reason?, isHalfDay? } — HR files leave for someone. */
export const POST = mobileRoute(async (req) => {
    const b = await readJson(req);
    return fromAction(await applyLeave({
        employeeId: Number(b.employeeId), leaveTypeId: Number(b.leaveTypeId), fromDate: String(b.fromDate ?? ''),
        toDate: String(b.toDate ?? ''), reason: typeof b.reason === 'string' ? b.reason : undefined, isHalfDay: b.isHalfDay === true,
    }), 201);
});
