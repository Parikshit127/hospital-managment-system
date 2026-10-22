import { prisma } from '@/backend/db';
import { ApiError, mobileRoute, ok } from '@/app/lib/mobile/api';
import { requireHr } from '@/app/lib/hr/hr-core';
import { revokeMobileSession } from '@/app/lib/mobile/mobile-auth';
import { logAudit } from '@/app/lib/audit';

/** POST /api/v1/hr/devices/:id/revoke — sign a lost/misused phone out (HR with hr.edit). */
export const POST = mobileRoute<{ id: string }>(async (_req, { session, params }) => {
    await requireHr('edit', 'employee');
    const row = await prisma.mobileSession.findFirst({ where: { id: params.id, org_id: session.organization_id }, select: { id: true } });
    if (!row) throw new ApiError('Device session not found', 404);
    await revokeMobileSession(row.id, 'revoked_by_hr');
    await logAudit({ action: 'HR_MOBILE_DEVICE_REVOKE', module: 'hr', entity_type: 'mobile_session', entity_id: row.id });
    return ok({ revoked: true });
});
