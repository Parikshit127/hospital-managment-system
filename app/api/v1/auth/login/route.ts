import * as bcrypt from 'bcryptjs';
import { prisma } from '@/backend/db';
import { isMfaRequiredRole } from '@/app/actions/mfa-actions';
import { checkLoginAttempt, clearLoginFailures, recordLoginFailure } from '@/app/lib/login-rate-limit';
import { ApiError, clientIp, fail, ok, publicRoute, readJson } from '@/app/lib/mobile/api';
import { startMobileSession, sessionDataFor, signMfaToken } from '@/app/lib/mobile/mobile-auth';
import { describeSession, geofenceStatus } from '@/app/lib/mobile/bootstrap';
import { loginBodySchema } from '@/app/lib/mobile/login-schema';
import { mobileRequest } from '@/app/lib/mobile/request-context';

/** POST /api/v1/auth/login — username + password + device + (current) location. */
export const POST = publicRoute(async (req) => {
    const parsed = loginBodySchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message || 'Invalid input');
    const { username, password, device, location } = parsed.data;
    const ip = clientIp(req);

    const attempt = checkLoginAttempt(username, ip);
    if (attempt.blocked) {
        return fail(`Too many failed attempts. Retry in ${Math.ceil(attempt.retryAfterMs / 60000)} minute(s).`, 429);
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        recordLoginFailure(username, ip);
        return fail('Invalid credentials', 401);
    }
    if (user.is_active === false) {
        recordLoginFailure(username, ip);
        return fail('Account is disabled. Contact your administrator.', 403);
    }
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (!org || !org.is_active) {
        recordLoginFailure(username, ip);
        return fail('Organization is inactive. Contact platform admin.', 403);
    }

    const base = sessionDataFor(user, org);
    const loc = location ?? null;

    if (await isMfaRequiredRole(user.role)) {
        const mfa = await prisma.user_mfa.findUnique({ where: { user_id: user.id } });
        if (mfa?.enabled) {
            clearLoginFailures(username, ip);
            const mfaToken = await signMfaToken({ session: base, device, location: loc, ip });
            return ok({ mfaRequired: true, mfaToken });
        }
    }

    const tokens = await startMobileSession(base, device, { location: loc, ip });
    clearLoginFailures(username, ip);

    await prisma.system_audit_logs.create({
        data: {
            user_id: String(user.id), username: user.username, role: user.role,
            action: 'MOBILE_LOGIN', module: 'auth', organizationId: org.id,
        },
    });

    const profile = await mobileRequest.run(base, () => describeSession(base));
    const geofence = await geofenceStatus(base, loc);
    return ok({ ...tokens, ...profile, geofence });
});
