import { fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { createEmployee, getEmployeeList } from '@/app/actions/hr-actions';

/** GET /api/v1/hr/employees?search=&designation=&departmentId=&employmentType=&isActive=&page=&limit= */
export const GET = mobileRoute(async (_req, { url }) => {
    const q = url.searchParams;
    const active = q.get('isActive');
    return fromAction(await getEmployeeList({
        search: q.get('search') ?? undefined, designation: q.get('designation') ?? undefined,
        departmentId: q.get('departmentId') ?? undefined, employmentType: q.get('employmentType') ?? undefined,
        isActive: active === null ? undefined : active === 'true',
        page: Number(q.get('page')) || undefined, limit: Number(q.get('limit')) || undefined,
    }));
});

export const POST = mobileRoute(async (req) => fromAction(await createEmployee((await readJson(req)) as any), 201));
