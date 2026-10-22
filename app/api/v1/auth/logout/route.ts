import { ok, mobileRoute } from '@/app/lib/mobile/api';
import { revokeMobileSession } from '@/app/lib/mobile/mobile-auth';

/** POST /api/v1/auth/logout — sign this device out. */
export const POST = mobileRoute(async (_req, { sessionId }) => {
    await revokeMobileSession(sessionId, 'logout');
    return ok({ signedOut: true });
});
