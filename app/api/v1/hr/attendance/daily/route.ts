import { ApiError, fromAction, mobileRoute, readJson } from '@/app/lib/mobile/api';
import { getAttendanceForDate, recordAttendance } from '@/app/actions/hr-actions';

/** GET /api/v1/hr/attendance/daily?date=YYYY-MM-DD */
export const GET = mobileRoute(async (_req, { url }) => {
    const date = url.searchParams.get('date');
    if (!date) throw new ApiError('date is required');
    const res: any = await getAttendanceForDate(date);
    if (!res?.success) return fromAction(res);
    // The action returns whole employee rows (incl. salary); a phone only needs identity fields.
    return fromAction({
        success: true,
        data: res.data.map((r: any) => ({
            employee: { id: r.employee.id, name: r.employee.name, employee_code: r.employee.employee_code, designation: r.employee.designation },
            attendance: r.attendance && {
                status: r.attendance.status, check_in: r.attendance.check_in, check_out: r.attendance.check_out,
                total_hours: r.attendance.total_hours, late_minutes: r.attendance.late_minutes, source: r.attendance.source,
            },
            onApprovedLeave: r.onApprovedLeave,
        })),
    });
});

/** POST /api/v1/hr/attendance/daily  { employeeId, date, checkIn?, checkOut?, status } — HR marks one employee-day. */
export const POST = mobileRoute(async (req) => {
    const b = await readJson(req);
    return fromAction(await recordAttendance({
        employeeId: Number(b.employeeId), date: String(b.date ?? ''), checkIn: b.checkIn || undefined,
        checkOut: b.checkOut || undefined, status: String(b.status ?? ''),
    }));
});
