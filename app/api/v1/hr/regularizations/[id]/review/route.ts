import { ApiError, fromAction, intParam, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { reviewRegularization } from '@/app/actions/hr-actions';

/** POST /api/v1/hr/regularizations/:id/review  { decision:'Approved'|'Rejected', note? } — manager of the employee, or HR with hr.approve. */
export const POST = mobileRoute<{ id: string }>(async (req, { params }) => {
    const b = await readJson(req);
    if (b.decision !== 'Approved' && b.decision !== 'Rejected') throw new ApiError("decision must be 'Approved' or 'Rejected'");
    const note = typeof b.note === 'string' ? b.note : undefined;
    return fromAction(await reviewRegularization(intParam(params.id), b.decision, note));
});
