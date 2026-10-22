import { ApiError, fromAction, intParam, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { approveLeave, rejectLeave } from '@/app/actions/hr-actions';

/** POST /api/v1/hr/leave/:id/review  { decision:'Approved'|'Rejected', note? } — manager of the employee, or HR with hr.approve. */
export const POST = mobileRoute<{ id: string }>(async (req, { params }) => {
    const b = await readJson(req);
    if (b.decision !== 'Approved' && b.decision !== 'Rejected') throw new ApiError("decision must be 'Approved' or 'Rejected'");
    const note = typeof b.note === 'string' ? b.note : undefined;
    const id = intParam(params.id);
    return fromAction(b.decision === 'Approved' ? await approveLeave(id, note) : await rejectLeave(id, note));
});
