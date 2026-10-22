import { ApiError, ok, publicRoute, readJson } from '@/app/lib/mobile/api';
import { rotateMobileSession } from '@/app/lib/mobile/mobile-auth';
import { refreshBodySchema } from '@/app/lib/mobile/login-schema';

/** POST /api/v1/auth/refresh — rotate the refresh token, get a new access token. */
export const POST = publicRoute(async (req) => {
    const parsed = refreshBodySchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message || 'Invalid input');
    const tokens = await rotateMobileSession(parsed.data.refreshToken, parsed.data.deviceId);
    return ok(tokens);
});
