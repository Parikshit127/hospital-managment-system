import { ok, mobileRoute } from '@/app/lib/mobile/api';
import { describeSession } from '@/app/lib/mobile/bootstrap';

/** GET /api/v1/auth/me — profile + capabilities (which tabs to show). */
export const GET = mobileRoute(async (_req, { session }) => ok(await describeSession(session)));
