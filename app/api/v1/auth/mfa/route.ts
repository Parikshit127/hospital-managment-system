import { prisma } from '@/backend/db';
import { verifyMFA } from '@/app/actions/mfa-actions';
import { ApiError, fail, ok, publicRoute, readJson } from '@/app/lib/mobile/api';
import { startMobileSession, verifyMfaToken } from '@/app/lib/mobile/mobile-auth';
import { describeSession, geofenceStatus } from '@/app/lib/mobile/bootstrap';
import { mfaBodySchema } from '@/app/lib/mobile/login-schema';
import { mobileRequest } from '@/app/lib/mobile/request-context';

/** POST /api/v1/auth/mfa — second step of login for roles that require MFA. */
export const POST = publicRoute(async (req) => {
    const parsed = mfaBodySchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message || 'Invalid input');

    const pending = await verifyMfaToken(parsed.data.mfaToken);
    // verifyMFA reads the tenant from the session, so run it as the half-authenticated user.
    const result = await mobileRequest.run(pending.session, () => verifyMFA(pending.session.id, parsed.data.code));
    if (!result.success) return fail(result.error || 'Invalid MFA code', 401);

    const tokens = await startMobileSession(pending.session, pending.device, { location: pending.location, ip: pending.ip });
    await prisma.system_audit_logs.create({
        data: {
            user_id: String(pending.session.id), username: pending.session.username, role: pending.session.role,
            action: 'MOBILE_LOGIN_MFA', module: 'auth', organizationId: pending.session.organization_id,
        },
    });
    const profile = await mobileRequest.run(pending.session, () => describeSession(pending.session));
    const geofence = await geofenceStatus(pending.session, pending.location);
    return ok({ ...tokens, ...profile, geofence });
});
