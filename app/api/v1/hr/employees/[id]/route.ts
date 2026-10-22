import { fromAction, intParam, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { getEmployeeDetail, updateEmployee } from '@/app/actions/hr-actions';

export const GET = mobileRoute<{ id: string }>(async (_req, { params }) => fromAction(await getEmployeeDetail(intParam(params.id))));

export const PATCH = mobileRoute<{ id: string }>(async (req, { params }) =>
    fromAction(await updateEmployee(intParam(params.id), (await readJson(req)) as any)));
